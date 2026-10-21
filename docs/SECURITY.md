# Security

## Authentication (Phase 2)
- Passwords: bcrypt (cost 12), max 72 chars. Never logged or returned (select:false + toJSON transform).
- Cookies: httpOnly, SameSite=Lax, Secure in production. Refresh cookie path-scoped to /api/auth.
- Login does not reveal whether an email exists (same error + dummy hash compare for timing).
- Registration does reveal duplicate emails (409). Accepted trade-off for usability; rate limited.
- Rate limits: login 10 failed/15min/IP, register 10/hour/IP, refresh 60/15min/IP.

## Not yet implemented (planned)
- Refresh-token reuse detection (token families) and "log out everywhere".
- Account lockout / CAPTCHA.
- CSRF tokens (only needed if client and API end up on different sites).

## Email verification + password reset (Phase 16)
- Link tokens: 32 random bytes (base64url), stored only as SHA-256 in AuthToken (same pattern as refresh
  sessions), single use via findOneAndDelete. Verification links live 24 h, reset links 1 h; MongoDB TTL
  cleans up unused ones. Issuing a new link deletes the previous ones for that purpose, so only the last
  email ever works.
- forgot-password answers 202 identically for known and unknown emails and sends nothing for unknown ones
  (no enumeration). reset-password requires a live token and revokes ALL sessions + remaining tokens: a
  reset doubles as account recovery from a stolen account.
- Completing a reset marks the email verified (mailbox control was proven by receiving the link).
- Verification is softly enforced: unverified users use the app; a dismissible banner + server-side
  resend (5/hour/IP) drive verification. Resend, verify and reset endpoints are IP rate
  limited (10/15 min for token-bearing calls).
- Mail delivery: nodemailer SMTP (SMTP_HOST/PORT/USER/PASS, MAIL_FROM). Without SMTP_HOST the server
  prints messages to its own console instead of sending - development needs no mail server; delivery
  failures are logged and never break the requesting call. In tests, mail is captured in an outbox.

## Workspaces (Phase 3)
- Every workspace route resolves the caller's membership server-side; client-sent roles are ignored.
- Role changes require outranking both target and new role; 'owner' cannot be assigned via API.
- Invite tokens: 32 random bytes, stored as SHA-256, single use, 7-day expiry, rate limited.
- Known limitation: emails are not proof of ownership until verified - the Phase 16 banner nudges users,
  but joining an invite by email is still the weak link until verification becomes mandatory. The invite
  token remains the real secret.
- Known limitation: invite tokens appear in the client URL path; share links over private channels.
- Password change revokes all refresh sessions. A stolen access token can still work for up to 15 minutes.

## Permissions (Phase 4)
- One permission module is the authority for REST and (later) Socket.IO. Unknown roles/actions are denied.
- Permission lookups use Object.hasOwn, so inputs like "__proto__" cannot match.
- Roles are always resolved from the database membership, never from the request.
- Project/task/comment/message actions are defined but not enforced until those features exist.
- Guest project scoping (isProjectScoped) is a hook only; it must be enforced when projects are built.
- Permissions are static per role. Per-workspace custom roles are out of scope.

## Projects (Phase 5)
- loadProject resolves the project by id AND the caller's workspace; cross-workspace access is structurally impossible.
- Guest scoping is enforced in the list query and in loadProject; all failures are 404.
- Only existing workspace members can be added to a project team.
- Removing someone from a workspace removes their project memberships, so re-adding them later does not
  silently restore guest access.
- Role downgrade to guest does not add project memberships; the guest simply loses visibility.
- Limits: list size capped (limit <= 100); a guest's visible-project lookup is capped at 1000.

## Tasks (Phase 6)
- Task routes sit behind loadProject (workspace-scoped, guest-scoped); loadTask matches on projectId, so a task
  from another project or workspace never resolves. All failures are 404.
- Zod strips unknown keys, so position, projectId, workspaceId, createdBy and version can never be mass-assigned.
- Updates and moves are atomic and version-checked; a stale client gets 409 and the current task.
- Limits: 100 tasks per column in the board response, 5000 tasks per project, 2000-character descriptions.
- Task writes (create/edit/move/delete) are rate limited per authenticated user (120/min, Phase 15); the socket
  events (Phase 8) reuse the same permission checks as REST.

  ## Sockets (Phase 7)
- Handshake authentication uses the access cookie; failures are rejected before any event handler runs.
- Origin must match CLIENT_URL when present (cross-site WebSocket hijacking).
- Room joins are validated with Zod (strings only, so operator objects never reach a query) and authorized with the same
  functions as REST. Everything inaccessible returns a "not found" code. Room names come from database documents.
- Revocation: access changes remove the user's sockets from affected rooms. Joins re-check after joining.
- Sockets live no longer than the access token. Like REST, a stolen access token works until it expires
  (up to ACCESS_TOKEN_MINUTES) even after logout or a password change.
- Limits: 256 KB messages (raised in Phase 13 for Yjs sync payloads; doc payloads are further capped per event), 10 connections per user, 60 events / 10 s per socket with disconnect on abuse, 50 rooms per socket.
- Handshake flood guard (Phase 15): each IP may attempt 30 socket handshakes per minute; excess attempts are refused
  with RATE_LIMITED before the JWT check or any database read. Skipped under NODE_ENV=test. When TRUST_PROXY is set,
  Socket.IO runs with `proxy: true` so handshake.address (and the guard) sees the real client behind the proxy.
- Known gap: connection counts are per process (move to the adapter if Redis is added).

## Presence and typing (Phase 12)
- Transient and never persisted: a roster and typing blips live only in memory while sockets are connected, so there
  is no data at rest to protect and nothing to leak through the database.
- Typing is the only high-frequency client event, so it is throttled twice: the global per-socket limiter (60 events/10 s)
  plus a dedicated per-socket, per-project relay cap (one typing.started per 3 s). Abusive floods are dropped, not queued.
- A typing event is only relayed to a room the socket already joined (the join is what proved access), so a client cannot
  inject typing into a project it cannot see; the attempt is refused with FORBIDDEN. Typing is never echoed to its sender.
- Presence rosters carry only { userId, name } and are emitted solely inside the owning project room - never to a
  workspace or another user's personal room.

## Collaborative editing / Project Notes (Phase 13)
- Payload validation is strict and per-event: doc.update <= 128 KB, doc.subscribe stateVector <= 4 KB, projectId is a
  24-hex ObjectId lowercased by Zod. Anything larger is rejected with VALIDATION_ERROR before the buffer touches Yjs.
- Every doc.subscribe and every doc.update re-checks the caller's WorkspaceMember (and ProjectMember, if guest) against
  the database; the socket must already be in `project:{projectId}` from a successful room.join. Guests have document:read
  but not document:edit, so a client-side read-only textarea is paired with a server-side refusal on every write.
- Yjs snapshots are opaque `Buffer` bytes on MongoDB. The server never parses them beyond `Y.applyUpdate`, so a
  maliciously crafted payload can at worst grow the doc's structure until the 128 KB per-update cap stops it. A corrupt
  snapshot fails hydration loudly, is logged, and is overwritten on the next successful persist.
- Snapshot persistence is debounced (4 s) and flushed best-effort when the room closes (project deleted, workspace
  deleted, or the last subscriber disconnects). Yjs `closeDocument` never leaves a stale in-memory doc behind.
- Doc channel rate limiting (Phase 15): on top of the global 60 events/10 s per-socket cap, each user may send at
  most 300 doc.update events per minute (far above human typing, which is at most one update per keystroke). The cap
  is per user, not per socket, so the 10-connections-per-user allowance cannot multiply it. Excess updates are
  rejected with RATE_LIMITED, never queued; the sender's provider resyncs on the next accepted transaction.
- Rosters (`doc.subscribers`) carry only { id, name } and are emitted inside the owning project room. Presence
  semantics are unchanged from Phase 12; the doc roster is separate because someone can be viewing the project
  without editing the notes.

## Deployment hardening (Phase 15 + 17)
- Task-write endpoints share a per-user rate limiter (keyed by the authenticated id, never a bare IP, so IPv6 clients
  are not collapsed into one bucket). Skipped automatically under NODE_ENV=test.
- `TRUST_PROXY` (env) sets Express's `trust proxy` to the number of reverse-proxy hops, so req.ip - and therefore any
  IP-based limiting - sees the real client behind a proxy. It defaults to unset (trust nothing), because trusting proxy
  headers on a directly-exposed app would let a client spoof its own IP.
- Runtime env guard (Phase 17, src/config/runtimeGuard.js): in production the server refuses to boot when CLIENT_URL
  is a localhost/http origin, JWT_ACCESS_SECRET is the .env.example placeholder, or SMTP_HOST is set without
  credentials. Missing SMTP_HOST and missing TRUST_PROXY only warn (console-print fallback / direct exposure are valid
  choices) - so a misconfigured deploy fails in its own boot log, not in user-facing behaviour.
- Headers (Phase 17): helmet with CSP disabled (API serves no HTML) and HSTS max-age pinned to 1 year
  includeSubDomains; body cap stays 10 KB JSON, socket messages 256 KB.
- Crash and shutdown semantics (Phase 17): unhandledRejection/uncaughtException log fatally and exit 1 (the platform
  restarts the container); SIGTERM/SIGINT drain socket.io + HTTP, and a unref'd 8 s deadline force-closes lingering
  connections before any platform SIGKILL. A second signal is ignored. Stacks never leave the server outside
  development.