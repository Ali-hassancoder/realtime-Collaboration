# Auth API
POST /api/auth/register  {name,email,password} -> 201 {user}, sets cookies
POST /api/auth/login     {email,password}      -> 200 {user}, sets cookies
POST /api/auth/refresh   (refresh cookie)      -> 200 {user}, rotates cookies
POST /api/auth/logout                          -> 200, clears cookies
GET  /api/auth/me        (access cookie)       -> 200 {user} | 401
Errors: VALIDATION_ERROR(400) INVALID_CREDENTIALS(401) UNAUTHENTICATED(401)
        TOKEN_INVALID(401) REFRESH_INVALID(401) EMAIL_IN_USE(409) RATE_LIMITED(429)

# Email verification + password reset (Phase 16)
POST /api/auth/verify-email    {token}          -> 200; single-use link token from the verification email
POST /api/auth/resend-verification (auth)       -> 202; replaces the previous link; 409 if already verified
POST /api/auth/forgot-password {email}          -> 202 always (same answer for unknown emails; no enumeration)
POST /api/auth/reset-password  {token,password} -> 200; sets the password, verifies the email, revokes all sessions
Errors added: VERIFY_LINK_INVALID(400) RESET_LINK_INVALID(400) EMAIL_ALREADY_VERIFIED(409)
User payloads now include emailVerified: boolean (emailVerifiedAt is server-only).

        # Users
PATCH /api/users/me            {name}                          -> {user}
POST  /api/users/me/password   {currentPassword,newPassword}   -> 200, revokes all sessions, clears cookies

# Workspaces (all require auth; non-members get 404)
GET    /api/workspaces                         -> {workspaces[]} each with my role (max 100)
POST   /api/workspaces         {name,description?} -> 201 {workspace}
GET    /api/workspaces/:id                     member
PATCH  /api/workspaces/:id     {name?,description?}  owner/admin
DELETE /api/workspaces/:id                     owner

GET    /api/workspaces/:id/members             any member -> {members[]}
PATCH  /api/workspaces/:id/members/:userId {role: admin|member|guest}   caller must outrank target and new role
DELETE /api/workspaces/:id/members/:userId     remove (outrank) or leave (self; owner cannot)

GET    /api/workspaces/:id/invites             owner/admin
POST   /api/workspaces/:id/invites {email,role} owner/admin -> 201 {invite, inviteUrl} (url shown once)
DELETE /api/workspaces/:id/invites/:inviteId   owner/admin
POST   /api/invites/accept {token}             any authenticated user whose email matches -> {workspace}

Errors added: FORBIDDEN(403) WORKSPACE_NOT_FOUND(404) MEMBER_NOT_FOUND(404) ALREADY_MEMBER(409)
OWNER_CANNOT_LEAVE(403) INVITE_INVALID(404) INVITE_EMAIL_MISMATCH(403) INVALID_CURRENT_PASSWORD(400)

# Roles (Phase 4)
Roles: owner, admin, manager, member, guest. Assignable via API: admin, manager, member, guest.
GET /api/workspaces and GET /api/workspaces/:id now include `permissions: string[]` for the caller's role.
Invites and role changes accept role: admin|manager|member|guest. See docs/PERMISSIONS.md.

# Projects (Phase 5)  - all under /api/workspaces/:workspaceId/projects, require auth + membership
GET    /projects?status=active|archived&page=1&limit=50  -> {projects[],total,page,limit}   project:read (guests: assigned only)
POST   /projects          {name,description?}  -> 201 {project}     project:create (creator joins the team)
GET    /projects/:id                           -> {project}         project:read (guests: assigned only)
PATCH  /projects/:id      {name?,description?,status?} -> {project} project:update
DELETE /projects/:id                                                project:delete
GET    /projects/:id/members                   -> {members[]}       project:read
POST   /projects/:id/members   {userId}        -> 201               project:manage_members (must be a workspace member)
DELETE /projects/:id/members/:userId                                project:manage_members

Errors added: PROJECT_NOT_FOUND(404) PROJECT_MEMBER_NOT_FOUND(404) ALREADY_PROJECT_MEMBER(409)
Any inaccessible project (other workspace, unassigned guest, malformed id) returns PROJECT_NOT_FOUND.

# Tasks (Phase 6) - under /api/workspaces/:workspaceId/projects/:projectId/tasks
GET    /board?limit=100   -> {columns:{todo|in_progress|in_review|done:{tasks[],total}}}   task:read
                             (max 100 per column, no descriptions, ordered by position)
POST   /   {title, description?, status?, priority?, assigneeId?, dueDate?} -> 201 {task}  task:create
           (assigneeId also needs task:assign and must be on the project team; dueDate is YYYY-MM-DD)
GET    /:taskId                                -> {task} (with description)                task:read
PATCH  /:taskId {version, title?, description?, status?, priority?, assigneeId?|null, dueDate?|null}   task:update
       (a status change puts the task at the bottom of the new column)
POST   /:taskId/move {version, status, prevId?, nextId?} -> {task}                         task:update
       (prevId+nextId = between, prevId only = bottom, nextId only = top, neither = bottom)
DELETE /:taskId                                                                           task:delete

Errors added: TASK_NOT_FOUND(404) TASK_VERSION_CONFLICT(409, error.details.current = latest task)
POSITION_CONFLICT(409) PROJECT_ARCHIVED(409) INVALID_ASSIGNEE(400) TASK_LIMIT_REACHED(409)
Writes in an archived project return PROJECT_ARCHIVED. A flat filtered list (GET /tasks?...) is not built yet.

# Comments (Phase 9) - under .../tasks/:taskId/comments
GET    /?before&limit  -> {comments[], hasMore}  (chronological, default 50, max 100)   task:read
POST   / {body}        -> 201 {comment}          (author name embedded)                comment:create
PATCH  /:commentId {version, body} -> {comment}  (author only)                         comment:edit_own
DELETE /:commentId                                                                comment:delete_own,
                                                                             or comment:delete_any (manager+)

Errors added: COMMENT_NOT_FOUND(404 - also a comment from another task)
COMMENT_VERSION_CONFLICT(409, error.details.current = latest comment)
Comments follow the task's visibility; writes in an archived project return PROJECT_ARCHIVED.

# Chat (Phase 10) - under /api/workspaces/:workspaceId/projects/:projectId/messages
GET    /?before&limit  -> {messages[], hasMore}  (chronological, default 50, max 100)   message:read
POST   / {body}        -> 201 {message}          (author name embedded)                message:create
PATCH  /:messageId {version, body} -> {message}  (author only)                         message:edit_own
DELETE /:messageId                                                                message:delete_own,
                                                                              or message:delete_any (admin+)

Errors added: MESSAGE_NOT_FOUND(404 - also a message from another project)
MESSAGE_VERSION_CONFLICT(409, error.details.current = latest message)
Writes in an archived project return PROJECT_ARCHIVED.

# Activity feed (Phase 9) - under /api/workspaces/:workspaceId/projects/:projectId/activity
GET /?before&limit -> {activities[], hasMore}  (newest first, default 30, max 100)     project:read
Entry: {id, type, actor{id,name}, taskId (nullable), meta, createdAt}.
Types: task.created, task.updated, task.moved, task.deleted, comment.created.
Written by the server on task/comment writes (fire-and-forget); no write endpoint.

# Notifications (Phase 11) - under /api/notifications, require auth
GET   /?before&limit=30&unread=true -> {notifications[], hasMore, unreadCount}   (newest first, max 100)
PATCH /:notificationId/read         -> {notification}   (idempotent; already read returns it unchanged)
POST  /read-all                     -> {updated}        (marks every unread one read)
Entry: {id, type, actor{id,name}, workspaceId, projectId (nullable), taskId (nullable), meta, readAt,
createdAt}. Types: task.assigned, comment.created (on a task you are assigned to), project.member_added,
invite.accepted. The inbox is personal: the only access check is authentication, and the server creates
entries (fire-and-forget) on assignment, comment, team-add and invite-accept writes.
Errors added: NOTIFICATION_NOT_FOUND(404 - also someone else's notification).

# Project Notes (Phase 13) - no REST surface
The collaborative Notes doc is entirely a Socket.IO channel: doc.subscribe / doc.update / doc.unsubscribe.
See docs/SOCKET_EVENTS.md for the payload contract and docs/ARCHITECTURE.md for the Yjs flow. The server
persists a snapshot to MongoDB on a 4-second debounce, but that column is never exposed over REST.

# Deployment (Phase 17)
GET  /api/health                    -> 200 {success, message, uptime}; dependency-free (no DB read) so
                                        platform probes never flake on a slow Atlas connection.
Error responses never contain stacks outside NODE_ENV=development (already true; asserted by tests).