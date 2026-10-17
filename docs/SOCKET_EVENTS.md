# Socket Event Contract

Naming: `<resource>.<action>` (e.g. task.updated, message.created). Do not invent names outside this file.

## Connection
- Endpoint: the API origin (Socket.IO path /socket.io).
- Authentication: the `access_token` httpOnly cookie, read from the handshake and verified exactly like REST
  (HS256 JWT, user loaded from the database). Frontend JavaScript never handles a token.
- Origin: if an Origin header is present it must equal the origin of CLIENT_URL (blocks cross-site WebSocket hijacking).
- Lifetime: the server disconnects the socket when its access token expires (the same window REST enforces).
  The client refreshes its session via REST and reconnects (at most 3 attempts in a row).
- Limits: 10 KB per message; 10 connections per user (per server process); 60 events per 10 s per socket.
  Over the limit an event gets RATE_LIMITED; past 3x the limit the socket is disconnected.

connect_error: err.message plus err.data.code in { UNAUTHENTICATED, TOKEN_INVALID, TOO_MANY_CONNECTIONS, INTERNAL_SERVER_ERROR }.
Auth codes mean "refresh the session, then reconnect once".

## Acknowledgements
Every client-to-server event takes an ack callback and is answered with
`{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
Codes: VALIDATION_ERROR, WORKSPACE_NOT_FOUND, PROJECT_NOT_FOUND, FORBIDDEN, TOO_MANY_ROOMS, RATE_LIMITED, INTERNAL_SERVER_ERROR.
Events from one socket are processed in order, one at a time.

## Rooms
| Room             | How a socket gets in                   | Purpose                                         |
|------------------|----------------------------------------|-------------------------------------------------|
| user:{userId}    | automatically on connect               | access changes and personal notifications        |
| workspace:{id}   | room.join, workspace member            | workspace-level updates (later phases)          |
| project:{id}     | room.join, can access the project      | task.*, comment.*, message.*, activity.created  |
At most 50 workspace/project rooms per socket. Room names are built only in server/src/sockets/rooms.js.

## Client -> server

### room.join
- Sender: authenticated client. Receiver: server (acknowledged).
- Payload: `{ type: 'workspace', workspaceId }` or `{ type: 'project', workspaceId, projectId }` (24-hex ObjectId strings).
- Authorization: caller is a member of the workspace (workspace:read); for projects also project:read, the project must
  belong to that workspace, and guests must be on its team. Same functions as the REST middleware
  (workspace.access.js, project.access.js). Access is re-checked after joining to close revocation races.
- Persisted: no. Response: `{ ok: true, data: { room } }`.
- Client behavior: join when a page opens; join again after every (re)connect and after access.changed.

### room.leave
- Payload: `{ type: 'workspace', workspaceId }` or `{ type: 'project', projectId }`. No authorization needed.
- Persisted: no. The personal user room cannot be left.
- Client behavior: leave when the page closes.

## Server -> client

### access.changed
- Sender: server, after any change to someone's access. Receiver: the affected user's sockets (user:{id}), or everyone
  in a deleted project's room.
- Payload: `{ workspaceId }`.
- Triggers: removed from or left a workspace, role changed, removed from a project team, project deleted,
  workspace deleted. The server has already removed sockets from rooms they may no longer be in.
- Persisted: no.
- Client behavior: invalidate workspace queries (refetch, so lost access shows as "not found") and re-run room joins.

### task.created / task.updated / task.deleted
- Sender: server, after a successful task write (create, edit, move, delete) over REST.
  Receiver: every socket in project:{projectId}, including the acting user's own sockets.
- Payload: task.created and task.updated carry `{ task, actorId }`, where task is exactly the REST response
  document (description included); task.deleted carries `{ taskId, actorId }`. `actorId` is the user who made
  the change.
- Persisted: no. A missed event is recovered by the client's next board fetch.
- Client behavior: applied straight to the cached board (inserted at its position order, moved between columns,
  or removed) and to an open task dialog; no refetch. The acting client ignores its own events because its REST
  response or optimistic move is already applied.

### comment.created / comment.updated / comment.deleted
- Sender: server, after a successful comment write over REST. Receiver: every socket in
  project:{projectId}, including the acting user's own sockets.
- Payload: create and update carry `{ comment, actorId }`, where comment is exactly the REST response
  document (author name embedded); deleted carries `{ commentId, taskId, actorId }`.
- Persisted: yes, in the Comment collection. A missed event is recovered by the client's next thread fetch.
- Client behavior: applied to the cached comment thread of the open task dialog; the acting client ignores
  its own echo (its REST response is already applied).

### message.created / message.updated / message.deleted
- Sender: server, after a successful chat write over REST. Receiver: every socket in
  project:{projectId}, including the acting user's own sockets.
- Payload: create and update carry `{ message, actorId }` (author name embedded); deleted carries
  `{ messageId, actorId }`.
- Persisted: yes, in the Message collection. A missed event is recovered by the client's next chat fetch.
- Client behavior: applied to the cached chat; the acting client ignores its own echo.

### activity.created
- Sender: server, after a task or comment write records an entry in the feed. Receiver: every socket in
  project:{projectId}, including the actor's own sockets - unlike the other events this one is NOT
  actor-filtered (docs/ENGINEERING_DECISIONS.md); clients dedupe by id.
- Payload: `{ activity }` with the actor `{ id, name }` embedded. Types: task.created, task.updated,
  task.moved, task.deleted, comment.created.
- Persisted: yes, in the Activity collection. A missed event is recovered by the client's next feed fetch.
- Client behavior: prepended to the cached feed, deduped by id.

### notification.created
- Sender: server, after a trigger writes a Notification row. Receiver: ONLY the recipient's sockets
  (user:{userId}) - notifications never enter a project or workspace room.
- Payload: `{ notification }` with the actor `{ id, name }` embedded. Types: task.assigned,
  comment.created (on a task you are assigned to), project.member_added, invite.accepted.
- Persisted: yes, in the Notification collection. A missed event is recovered by the client's next
  inbox fetch.
- Client behavior: prepended to the cached inbox and the unread badge bumps. There is no actor filter:
  every event that arrives belongs to this user (docs/ENGINEERING_DECISIONS.md).

## Planned (not implemented yet)
presence.updated, typing.started, typing.stopped (Phase 12, transient and never persisted).