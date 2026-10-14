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