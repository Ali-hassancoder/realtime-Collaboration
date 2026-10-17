# Security

## Authentication (Phase 2)
- Passwords: bcrypt (cost 12), max 72 chars. Never logged or returned (select:false + toJSON transform).
- Cookies: httpOnly, SameSite=Lax, Secure in production. Refresh cookie path-scoped to /api/auth.
- Login does not reveal whether an email exists (same error + dummy hash compare for timing).
- Registration does reveal duplicate emails (409). Accepted trade-off for usability; rate limited.
- Rate limits: login 10 failed/15min/IP, register 10/hour/IP, refresh 60/15min/IP.

## Not yet implemented (planned)
- Email verification and password reset: need an email provider. Design: single-use random token,
  stored hashed with expiry (like sessions), emailed as link, invalidates all sessions on reset.
- Refresh-token reuse detection (token families) and "log out everywhere".
- Account lockout / CAPTCHA.
- CSRF tokens (only needed if client and API end up on different sites).
- trust proxy setting for rate limiting behind a reverse proxy (Phase 17).

## Workspaces (Phase 3)
- Every workspace route resolves the caller's membership server-side; client-sent roles are ignored.
- Role changes require outranking both target and new role; 'owner' cannot be assigned via API.
- Invite tokens: 32 random bytes, stored as SHA-256, single use, 7-day expiry, rate limited.
- Known limitation: emails are not verified yet, so the email-match check on invites is a second
  factor, not proof of mailbox ownership. The token is the real secret. Email verification is planned.
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
- Not yet done: a rate limiter for task writes (planned for Phase 15), and the socket events (Phase 8) must reuse
  the same permission checks.

  ## Sockets (Phase 7)
- Handshake authentication uses the access cookie; failures are rejected before any event handler runs.
- Origin must match CLIENT_URL when present (cross-site WebSocket hijacking).
- Room joins are validated with Zod (strings only, so operator objects never reach a query) and authorized with the same
  functions as REST. Everything inaccessible returns a "not found" code. Room names come from database documents.
- Revocation: access changes remove the user's sockets from affected rooms. Joins re-check after joining.
- Sockets live no longer than the access token. Like REST, a stolen access token works until it expires
  (up to ACCESS_TOKEN_MINUTES) even after logout or a password change.
- Limits: 10 KB messages, 10 connections per user, 60 events / 10 s per socket with disconnect on abuse, 50 rooms per socket.
- Known gaps: connection counts are per process (move to the adapter if Redis is added); no per-IP limit on handshake
  attempts yet (Phase 15); typing/presence events will need their own throttling (Phase 12).