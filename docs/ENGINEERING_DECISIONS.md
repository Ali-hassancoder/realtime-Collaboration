# Engineering Decisions

Decision: Install only dependencies needed per phase.
Why: Smaller attack surface, less maintenance.
Alternative: Install the full stack on day one.
Rejected because: Unused packages add risk and noise.

Decision: ES modules (`"type": "module"`) on the server.
Why: Matches the client's module system and modern Node.
Alternative: CommonJS.
Rejected because: Mixed module styles across the codebase.

Decision: createApp() factory separate from server startup.
Why: Tests can load the app without a database or open port.
Alternative: Export a ready-made app from app.js with listen().
Rejected because: Hard to test.

Decision: JWT access token + opaque refresh token, both in httpOnly cookies.
Why: JS cannot read the tokens (XSS-resistant); refresh tokens are revocable because they live in the DB (hashed).
Alternative: JWT in localStorage.
Rejected because: any XSS can steal it, and it cannot be revoked server-side.

Decision: Refresh tokens are single-use (rotated) and stored as SHA-256 hashes.
Why: A stolen DB dump does not yield usable tokens; replay of an old token fails.
Alternative: Long-lived JWT refresh tokens.
Rejected because: no revocation, no rotation.

Decision: bcryptjs instead of native bcrypt/argon2.
Why: No native build step (reliable on Windows). Cost factor 12.
Alternative: argon2.
Rejected because: native build friction for now; can migrate later (hash upgrade on login).

Decision: Memberships in a separate WorkspaceMember collection with a role field.
Why: Queried by user and by workspace; roles are per membership; avoids unbounded arrays in one document.
Alternative: Embed members array in Workspace.
Rejected because: Hard to query "my workspaces", contention on one document, size limits.

Decision: Non-members receive 404 (not 403) for workspace resources.
Why: Prevents confirming that a workspace ID exists.
Alternative: 403 for non-members.
Rejected because: Leaks existence.

Decision: Invitations are one-time links (hashed token) instead of emails, for now.
Why: No email provider yet; the invitee must be logged in with the invited address.
Alternative: Add users directly by email.
Rejected because: Requires the user to exist already and gives no consent step.
Revisit: Phase 11 (notifications) / when an email provider is chosen.

Decision: Central permission map plus a rank comparison (workspace.permissions.js).
Why: One place to audit; "must outrank the target" prevents admins from managing admins.
Alternative: Inline role checks in each controller.
Rejected because: Easy to miss or drift.

Decision: "Project manager" is a workspace-level role (manager), ranked between admin and member.
Why: One role per membership keeps authorization simple and consistent across REST and sockets.
Alternative: Per-project roles on ProjectMember only.
Rejected because: More complex checks everywhere. Can be layered on top in Phase 5 if needed.

Decision: The server sends the caller's permission list with each workspace response.
Why: The client never duplicates rules, so UI and server cannot drift apart.
Alternative: Mirror the permission map in client code.
Rejected because: Two copies drift. (Client checks remain UI hints only.)

Decision: Roles and the action matrix live in one module that models, validation and middleware import.
Why: Adding a role is a one-file change plus the matrix; no scattered enum lists.
Alternative: Separate enums in model, validation and client.
Rejected because: That is how a role gets added in one place and forgotten in another.

Decision: Projects are nested under workspaces in the URL, and loaded by (projectId AND workspaceId).
Why: The workspace membership/role is resolved once, and a project id from another workspace can never match.
Alternative: Flat /api/projects/:id, resolving the workspace from the project.
Rejected because: Easier to forget the membership check; the nested form makes it structural.

Decision: Guests see only projects they are explicit ProjectMembers of; everyone else sees all projects.
Why: Matches the guest role's purpose (external collaborators) without per-project roles.
Alternative: Per-project visibility settings, or every member explicitly assigned.
Rejected because: More UI and rules for little value now.

Decision: Inaccessible projects return 404, not 403.
Why: Avoids confirming that a project id exists.
Alternative: 403.
Rejected because: Leaks existence.

Decision: Offset pagination (page/limit) for projects.
Why: Simple; project counts per workspace are small.
Alternative: Cursor pagination.
Rejected because: Unnecessary here. Revisit for tasks, messages and activity, which can grow large.

Decision: Order tasks with a float position per column; the client sends neighbour ids, the server computes the position.
Why: A move writes one document; the server stays authoritative; stale neighbours are detected (409).
Alternative: Integer positions that shift every task below the insertion point.
Rejected because: Many writes per move, more contention between users.
Alternative: String ranks (LexoRank).
Rejected because: More code for the same result; floats plus a rare rebalance are enough here.

Decision: Optimistic concurrency with a per-task version on every update and move.
Why: Never silently overwrite someone else's change. The check is part of the atomic update (findOneAndUpdate
with version in the filter), so there is no read-then-write race.
Alternative: Last write wins.
Rejected because: Lost updates.

Decision: The board endpoint returns at most 100 tasks per column with a total, and omits descriptions.
Why: Bounded payloads; descriptions are only needed when a task is opened.
Alternative: One unbounded task list, or one request per column with pagination.
Rejected because: Unbounded payloads, or more complex caching for optimistic moves.

Decision: Assignees must be on the project team.
Why: One consistent definition of "who works on this project"; guests can only be assigned within projects they can see.
Alternative: Any workspace member.
Rejected because: A task could be assigned to someone who cannot open its project.

Decision: @hello-pangea/dnd for drag and drop.
Why: Small API for Kanban, built-in keyboard and screen-reader support.
Alternative: dnd-kit.
Rejected because: More code for multi-column boards with no benefit here.

Decision: Description limited to 2000 characters.
Why: The global JSON body limit is 10 KB; 2000 characters stays under it even for multi-byte scripts.

Decision: Authenticate sockets with the existing httpOnly access cookie, read from the handshake.
Why: The same credential and the same checks as REST; JavaScript never handles a token.
Alternative: Send the JWT in the Socket.IO `auth` option.
Rejected because: It requires exposing the token to JavaScript, which is what the cookie design avoids.

Decision: Check the Origin header on the handshake (allowRequest).
Why: Same-site is not same-origin (another port on the same host is same-site), and WebSockets are not subject to CORS.
Alternative: Rely on SameSite=Lax only.
Rejected because: It leaves a cross-site WebSocket hijacking path in some deployments.

Decision: One implementation of membership and project access, shared by REST and sockets.
Why: Security rules for REST and Socket.IO must be consistent; two copies drift.
Alternative: Duplicate the checks in the socket handlers.
Rejected because: That is how REST and sockets end up disagreeing about who can see what.

Decision: Revoke live access by re-deriving allowed rooms from the database and removing sockets
(socketsLeave on the user room), instead of tracking each socket's rooms in memory.
Why: Works with any Socket.IO adapter (including Redis later); no state to keep in sync.
Alternative: Keep a per-socket room list and re-validate it.
Rejected because: It breaks with a multi-instance adapter.

Decision: Disconnect sockets when the access token expires; the client refreshes and reconnects.
Why: Sockets get the same time limit as REST, with no separate session mechanism.
Alternative: Authenticate once and keep the socket until it closes.
Rejected because: A stolen or revoked session would stay live indefinitely.

Decision: Process each socket's events one at a time, and re-check authorization after joining a room.
Why: A quick join then leave cannot be reordered, and a revocation during a join cannot leave a stale membership.
Alternative: Handle events concurrently.
Rejected because: Both are real races.

Decision: One design system in client/src/index.css (Tailwind v4 @theme tokens, keyframes and helper classes) for the colorful, animated UI.
Why: The brand gradient (indigo -> violet -> fuchsia), entrance animations and surfaces stay consistent across screens, and role/status colors live in shared maps (ROLE_STYLES in lib/permissions.js, STATUSES/PRIORITIES in features/tasks/constants.js), so a new role or status gets its colors in one place.
Alternative: Inline utility classes chosen per screen, or adding a component library.
Rejected because: Per-screen styling drifts between pages; a component library adds a dependency for a small set of primitives.
Note: All motion honors prefers-reduced-motion, and status/role colors are always paired with a text label (color is never the only signal).

Decision: Task changes are published to the project room as the full task JSON, and clients apply them to the cached board directly.
Why: One broadcast per change reaches every open board instantly with no refetch storm, and the payload is exactly the REST response, so there is one shape to keep consistent.
Alternative: Emit a "board changed" ping and let every client refetch.
Rejected because: Each tap from any user would refetch the whole board for everyone.
Alternative: Emit field-level diffs.
Rejected because: A client with a stale cache cannot rebuild the correct document from a diff.

Decision: The acting client ignores its own task events (actorId match).
Why: Its REST response (or optimistic move) is already applied; ignoring the echo avoids double-application and a race between the socket event and the HTTP response.
Alternative: Apply every event, including your own.
Rejected because: The two arrivals are not ordered, so applying both is a race with no upside.

Decision: Comments and messages reuse the per-document version pattern of tasks (PATCH with 409 carrying the current copy).
Why: One optimistic-concurrency model everywhere; a conflict shows the other person's text instead of overwriting it.
Alternative: Last write wins with a full-body PATCH.
Rejected because: Lost updates with no way to recover the other edit.

Decision: Chat is a project-scoped room every project member shares; no direct messages in this phase.
Why: The permission map (message:*), the project room and project cleanup already describe exactly who may chat where; a DM model would add conversations, participants and another cleanup chain.
Alternative: Direct message threads between users.
Rejected because: Out of scope for Phase 10; team chat matches the room model.

Decision: Cursor pagination (before + limit, newest-first query with a limit+1 probe) for comments, messages and the feed.
Why: All three grow with use; rows inserted while paging never shift or duplicate pages, and the probe keeps hasMore honest.
Alternative: Offset pagination like projects (revisits the Phase 5 note).
Rejected because: Inserts between pages make page 2 skip or repeat rows.

Decision: One Activity collection records task and comment history; chat is deliberately excluded.
Why: The feed answers "what happened on this project" - comments are discussion and tasks are work, while chat is high-volume, low-signal chatter that would bury both.
Alternative: Also record messages, or derive the feed by auditing each collection.
Rejected because: Messages drown the feed; deriving has no audit data for moves and edits.

Decision: Activity is recorded fire-and-forget and its event is the one event not actor-filtered.
Why: A feed entry must never fail the task or comment write it describes (failures are logged and dropped), and because the REST response does not carry the entry, the actor needs its own activity.created event too; clients dedupe by id instead of filtering by actor.
Alternative: Actor-filter activity.created like the other events.
Rejected because: The acting user's feed would silently miss their own actions until the next refetch.

Decision: Notifications are delivered only to the recipient's user room (user:{id}) and never to a project room.
Why: An inbox is personal; the room already exists for access.changed, so delivery is one emit per trigger and other project members never receive another person's notification (tested).
Alternative: Emit to the project room and let each client filter by recipientId.
Rejected because: It broadcasts personal data to everyone and depends on clients filtering correctly.

Decision: Four notification triggers only: task.assigned, comment.created (on a task you are assigned to), project.member_added, invite.accepted.
Why: Each one names a person who must react; task moves, edits and deletes are covered by the project feed instead of becoming per-user noise.
Alternative: Notify on every write that mentions or touches the recipient.
Rejected because: High-frequency events (moves, edits) would turn the inbox into a duplicate of the activity feed.

Decision: Notification writes are fire-and-forget like activity, and self-notifications are dropped inside notify().
Why: A bell entry must never fail the action it describes, and every caller shares one self-filter instead of repeating String(recipientId) !== String(actor._id).
Alternative: Make the trigger write part of the request transaction and 500 on failure.
Rejected because: A failed bell entry would break task assignment and commenting.

Decision: Reading a notification is idempotent (readAt is set once); "mark all read" reports how many rows changed.
Why: Clients may retry a PATCH after a network hiccup without moving the timestamp, and the bulk response is useful for tests and logs.
Alternative: Always overwrite readAt on every PATCH.
Rejected because: It rewrites history and makes "read at" meaningless.

Decision: Leaving or being removed from a workspace deletes that user's notifications for the workspace; deleting a task, project or workspace cascades to the notifications that reference it.
Why: A notification is a pointer to something the user can act on; after their access or the target is gone the pointer is dead, and dead inbox rows would accumulate forever without any read path that can resolve them.
Alternative: Keep history rows and filter them at read time.
Rejected because: The filter would need a live access check per row on every inbox page.

Decision: Presence is an in-memory roster derived from room membership, broadcast as the full list on every change, and never persisted.
Why: "Who is here" is only meaningful while sockets are live; the join/leave/disconnect events already carry the transitions, so a per-project Map is the whole store and a full roster makes a dropped event self-correcting on the next change.
Alternative: Persist presence (last-seen timestamps) and expose it over REST, or send join/leave deltas.
Rejected because: Stored presence is stale the moment a socket drops without a clean disconnect, and deltas desynchronise after any missed event with no baseline to recover from.

Decision: Typing is relayed server-side with its own throttle and is never echoed to the sender; a missed typing.stopped is cleared by a client-side timeout.
Why: Typing is the one high-frequency, low-value event, so a per-socket per-project relay cap (on top of the global limiter) bounds the flood, and self-expiring indicators mean correctness never depends on a stop event arriving (a closed tab sends none).
Alternative: Let clients broadcast typing peer-to-peer, or persist a typing flag.
Rejected because: There is no peer-to-peer channel and a persisted flag would need TTL cleanup for a blip that lasts seconds.

Decision: A typing event is only accepted from a socket already in the target project room, and presence/typing never leave that room.
Why: The room join is where access was already authorised, so membership is the check - a client cannot inject typing into a project it cannot see, and transient presence data is scoped exactly like the live content it sits beside.
Alternative: Re-authorise the projectId against the database on every typing event.
Rejected because: It adds a DB round-trip per keystroke to re-derive what joining the room already proved.

Decision: Presence and typing add no REST endpoints and no socket-to-server write path beyond the two throttled typing events; REST still owns all durable state.
Why: They are transient signals with nothing to create, list or edit, so routing them through the same REST-plus-events model as tasks would only invent storage for data that must not outlive the connection.
Alternative: Model presence as a document updated over REST.
Rejected because: It persists and exposes state that is wrong the instant a client disconnects uncleanly.