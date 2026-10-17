# Database

## User
name, email (unique), passwordHash (select:false). Timestamps.

## Session
userId, tokenHash (unique), expiresAt (TTL index), userAgent.

## Workspace
name, description, ownerId. Index: ownerId.

## WorkspaceMember  (join collection)
workspaceId, userId, role (owner|admin|manager|member|guest).
Indexes: unique (workspaceId, userId); (userId).
Why separate: queried from both sides, carries a role, unbounded growth. Embedding in Workspace
would force array rewrites on every membership change and cap workspace size.

## WorkspaceInvite
workspaceId, email, role (admin|member|guest), tokenHash (unique, select:false), invitedBy, expiresAt.
Indexes: unique (workspaceId, email); TTL on expiresAt. Raw token is never stored.

## Notes
- No multi-document transactions yet (standalone MongoDB). Workspace creation compensates manually.
- Workspace deletion removes members and invites; projects, tasks, comments, messages, activity and
  notifications are removed by the cascades below.

## Project
workspaceId, name, description, status (active|archived), createdBy. Timestamps.
Index: (workspaceId, status, createdAt desc).

## ProjectMember  (join collection)
workspaceId, projectId, userId, addedBy.
Indexes: unique (projectId, userId); (workspaceId, userId).
Why separate: team list per project, guest access list, unbounded growth, cleanup by user.
workspaceId is duplicated on purpose so guest scoping and cleanup need no join.

## Cascades (manual, no transactions)
- Delete project: Project, then its ProjectMembers. (Phase 6 adds tasks.)
- Delete workspace: also all Projects and ProjectMembers of the workspace.
- Leave / removed from workspace: that user's ProjectMembers in the workspace.

## Task
workspaceId, projectId, title, description (max 2000), status (todo|in_progress|in_review|done),
priority (low|medium|high|urgent), assigneeId (nullable), dueDate (nullable, UTC midnight),
position (float, per column), version (int, optimistic concurrency), createdBy. Timestamps.
Indexes: (projectId, status, position, _id) for board columns; (workspaceId, assigneeId) for cleanup.
Limit: 5000 tasks per project.

Ordering: position is a float. A drop between two tasks takes the midpoint; top/bottom use min-1024 / max+1024.
When a gap falls below 1e-6 the column is renumbered (1024, 2048, ...). Ties are broken by _id.
Concurrent drops into the same gap can produce equal positions; the _id tie-break keeps the order stable.

## Comment  (Phase 9)
workspaceId, projectId, taskId, authorId, body (max 2000), version (int, optimistic concurrency). Timestamps.
Indexes: (taskId, _id desc) for the thread; (projectId), (workspaceId) for cleanup.

## Message  (Phase 10)
workspaceId, projectId, authorId, body (max 2000), version (int). Timestamps.
Indexes: (projectId, _id desc) for chat pagination; (workspaceId) for cleanup.
Editing rewrites the body and bumps version; the previous text is not kept.

## Activity  (Phase 9)
workspaceId, projectId, actorId, type (task.created | task.updated | task.moved | task.deleted |
comment.created), taskId (nullable: null when not tied to one task or the task is gone), meta (Mixed:
title, field names, column keys, comment excerpt). Timestamps.
Indexes: (projectId, _id desc) for the feed; (taskId), (workspaceId) for cleanup.
Written only by the server (recordActivity, fire-and-forget); there is no write endpoint.

## Notification  (Phase 11)
recipientId, actorId, type (task.assigned | comment.created | project.member_added | invite.accepted),
workspaceId, projectId (nullable), taskId (nullable), meta (Mixed: taskTitle, excerpt, projectName,
workspaceName), readAt (nullable). Timestamps.
Indexes: (recipientId, _id desc) for the inbox; (recipientId, readAt) for unread counts; (taskId),
(projectId), (workspaceId) for cleanup.
Written only by the server (notify, fire-and-forget); the inbox has no write endpoint besides read marks.

## Cascades (manual, no transactions)
- Delete task: its comments, every feed entry and every notification that references it (the task.deleted
  feed entry is recorded afterwards and stands alone).
- Delete project: also its tasks, comments, messages, feed entries and notifications.
- Delete workspace: also all projects, tasks, comments, messages, feed entries and notifications.
- Removed from a project team / leave or removed from a workspace: tasks assigned to that user become
  unassigned (version bumped). Comments and messages stay (authored history belongs to the project).
  Leaving or being removed from a workspace also deletes that user's notifications for that workspace.