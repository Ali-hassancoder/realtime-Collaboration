# Database

## User
name, email (unique), passwordHash (select:false). Timestamps.

## Session
userId, tokenHash (unique), expiresAt (TTL index), userAgent.

## Workspace
name, description, ownerId. Index: ownerId.

## WorkspaceMember  (join collection)
workspaceId, userId, role (owner|admin|member|guest).
Indexes: unique (workspaceId, userId); (userId).
Why separate: queried from both sides, carries a role, unbounded growth. Embedding in Workspace
would force array rewrites on every membership change and cap workspace size.

## WorkspaceInvite
workspaceId, email, role (admin|member|guest), tokenHash (unique, select:false), invitedBy, expiresAt.
Indexes: unique (workspaceId, email); TTL on expiresAt. Raw token is never stored.

## Notes
- No multi-document transactions yet (standalone MongoDB). Workspace creation compensates manually.
- Workspace deletion removes members and invites; later phases must add projects/tasks/etc.