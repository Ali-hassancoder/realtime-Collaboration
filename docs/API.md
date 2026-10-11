# Auth API
POST /api/auth/register  {name,email,password} -> 201 {user}, sets cookies
POST /api/auth/login     {email,password}      -> 200 {user}, sets cookies
POST /api/auth/refresh   (refresh cookie)      -> 200 {user}, rotates cookies
POST /api/auth/logout                          -> 200, clears cookies
GET  /api/auth/me        (access cookie)       -> 200 {user} | 401
Errors: VALIDATION_ERROR(400) INVALID_CREDENTIALS(401) UNAUTHENTICATED(401)
        TOKEN_INVALID(401) REFRESH_INVALID(401) EMAIL_IN_USE(409) RATE_LIMITED(429)

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