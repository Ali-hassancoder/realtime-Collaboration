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
| project:{id}     | room.join, can access the project      | task.*, comment.*, message.*, activity.created, presence.updated, typing.*  |
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

### typing.started / typing.stopped
- Sender: authenticated client. Receiver: server (acknowledged). Receiver of the relay: the rest of the project room.
- Payload: `{ projectId }` (24-hex ObjectId). The server relays to `project:{projectId}` excluding the sender.
- Authorization: the socket must already be in that project room (a join is what proved access); otherwise FORBIDDEN.
- Throttling: the server relays at most one typing.started per socket per project per 3 s. Every event is still
  acknowledged `{ ok: true }` so the client never has to guess. typing.stopped is never throttled.
- Persisted: no. Never touches the database (docs/ENGINEERING_DECISIONS.md).
- Client behavior: emit typing.started as the composer is typed in (self-throttled), typing.stopped on send/clear/leave.

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

### presence.updated
- Sender: server, whenever the set of users viewing a project changes (a socket joins or leaves the
  project room, or disconnects). Receiver: every socket in project:{projectId}, including the joiner.
- Payload: `{ projectId, online }` where online is the FULL roster `[{ userId, name }]`, not a delta -
  the client replaces its list wholesale, so a missed event is corrected by the next one.
- Persisted: no. Presence is in-memory only and rebuilt from room joins; it is deliberately never stored.
- Client behavior: replace the cached roster for that project and render who is online.

### typing.started / typing.stopped
- Sender: server, relaying another member's typing event. Receiver: every socket in project:{projectId}
  except the one that originated it (the typist never sees its own indicator).
- Payload: typing.started carries `{ projectId, user: { id, name } }`; typing.stopped carries `{ projectId, userId }`.
- Persisted: no. A blip with no history: if a stopped event is missed the client's own timeout clears it.
- Client behavior: show "<name> is typing" and let it expire after a few seconds unless refreshed by another event.

## Planned (not implemented yet)
None. Every designed socket event is implemented; presence and typing (Phase 12) are transient and never persisted.