# Architecture

React (Vite) -> REST (Express) -> MongoDB (Mongoose)
React -> Socket.IO client -> Node HTTP server -> Socket.IO server

- REST handles CRUD and history. Socket.IO handles live events only.
- server.js: startup only. app.js: Express config. sockets/: realtime. modules/: features (from Phase 2).

## Real-time (Phase 7)
sockets/index.js         server setup: origin check, handshake auth, connection cap, per-socket rate limit, handlers
sockets/auth.js          handshake authentication from the access cookie
sockets/roomhandler.js    room.join / room.leave with the same checks as REST
sockets/realtime.js      helpers the REST services call: syncUserAccess, closeProject, beginWorkspaceClose
workspace.access.js, project.access.js
                         the single implementation of "may this user see this workspace/project",
                         used by both the REST middleware and the socket handlers
Flow: REST changes access -> service updates the database -> realtime helper removes sockets from rooms
      and sends access.changed -> client refetches.

## Comments, chat and the feed (Phase 9 + 10)
modules/comment/         task comments: REST CRUD under .../tasks/:taskId/comments (version + author rules)
modules/message/         project chat: REST CRUD under .../projects/:projectId/messages
modules/activity/        the project feed: written by recordActivity from task and comment writes;
                         read-only API at .../projects/:projectId/activity
sockets/commentevents.js, messageevents.js, activityevents.js
                         one module per resource owns its event names and payload shapes (like taskevents.js)
Flow: REST write -> service persists -> controller publishes the event to the project room and records a
      feed entry (tasks and comments) -> clients apply the payload to their cached thread/chat/board/feed.
      No socket handlers were added: REST stays the only write path (docs/SOCKET_EVENTS.md).
Client: features/comments (TaskComments in the task dialog), features/chat (ProjectChat panel),
      features/activity (ActivityFeed). Live events mutate useInfiniteQuery caches: pages are
      newest-first, each page chronological; new items go to page 0 and edits match by id across pages.

## Notifications (Phase 11)
modules/notification/    the personal inbox: REST list + read marks under /api/notifications
sockets/notificationevents.js
                         emits notification.created to user:{recipientId} only
Flow: a write that concerns someone else (task assigned, comment on their task, added to a project team,
      invite accepted) calls notify() from the controller -> the row is written fire-and-forget and the
      recipient's sockets are told -> the bell prepends it and bumps the unread count.
Client: features/notifications (NotificationBell in the header; infinite inbox cache keyed ['notifications']).
      Clicking an entry marks it read and navigates to the project; task entries deep-link with ?task=<id>,
      which opens the task dialog straight away (TaskBoard reads the query parameter).

## Presence and typing (Phase 12)
sockets/presence.js      in-memory roster per project (userId -> live sockets); rebuilt from room joins, never stored
sockets/typingevents.js  relays client typing.started/stopped to the project room, excluding the sender
                         (roomhandler.js registers/clears presence on project join/leave; index.js clears on disconnect
                          and closes a project's roster when the project/workspace is deleted via realtime.onRoomClosed)
Flow: socket joins project room -> presence.addPresence broadcasts the full roster to the room -> a member types ->
      client emits typing.started -> server throttles and relays it to everyone else. No REST, no database: both are
      transient and live only while sockets are connected.
Client: features/presence (usePresence/useTyping/useTypingSender) rendered in features/chat (ProjectChat shows an
      online avatar stack and a "<name> is typing" line). State lives in the components, not the query cache.

## Collaborative editing / Project Notes (Phase 13)
modules/documents/document.model.js     one row per project: { workspaceId, projectId (unique), snapshot: Buffer, lastEditorId }
modules/documents/document.service.js   the live Y.Doc registry: hydrate from MongoDB on first subscribe, apply
                                         remote updates, debounced persistence (SAVE_DEBOUNCE_MS = 4 s), best-effort
                                         flush on eviction, subscriber-roster management (deduplicated by user id)
sockets/documentevents.js               doc.subscribe / doc.update / doc.unsubscribe handlers; every one re-authorizes
                                         against the DB (in-room + document:read/edit + guest team membership) and
                                         broadcasts the raw Yjs bytes to the project room except the sender.
                                         Registers an onRoomClosed hook so a deleted project evicts the in-memory Y.Doc.
Flow: client opens the Project page -> room.join -> the useDocument hook mounts a fresh Y.Doc and the SocketYjsProvider,
      which emits doc.subscribe with its state vector -> server hydrates from MongoDB if needed and replies with the
      missing ops -> every local transaction (origin='local') is emitted as doc.update, the server applies and rebroadcasts
      to the rest of the project room, and persists to MongoDB on a 4 s debounce.
      Reconnect: provider listens for socket 'connect' and re-subscribes with its current state vector, so the client
      receives only the operations it missed while offline.
      Client applies incoming bytes with origin='remote' so they are not echoed back to the server.
Client: features/documents (SocketYjsProvider, useDocument hook, ProjectNotes panel). The Project Notes surface is a
      plain textarea bound to Y.Text via a prefix/suffix diff, so concurrent edits merge without a rich-text editor.
      Guests see the doc read-only (hasPermission(workspace, 'document:edit') controls the textarea; the server
      enforces it again on every doc.update).

Deliberately a custom provider, not the public y-socket-io package: our protocol only needs three client->server
and two server->client events, and y-socket-io would drag in y-protocols sync/awareness machinery the server does
not run. See docs/ENGINEERING_DECISIONS.md.

## Deployment topology (Phase 17)
Two hosts, by design: the Vite SPA is static hosting (any CDN), the API must be one persistent Node process
(Socket.IO websockets do not survive serverless). server/Dockerfile builds that process (node:22-alpine, npm ci
--omit=dev, non-root USER node, ENV NODE_ENV=production); config arrives only through env - .env is never copied
into the image, server/.env.production.example documents the required keys.
Boot order in server.js: runtimeGuard (fail fast on unsafe prod env) -> connectDB -> createApp -> initSocket -> listen.
Shutdown lives in src/config/shutdown.js: SIGTERM/SIGINT -> io.close + httpServer.close -> disconnectDB -> exit 0,
with an 8 s unref'd deadline that force-closes lingering connections if the drain hangs.
/api/health is the dependency-free probe target. Scaling caveat unchanged: presence/typing and the Phase 15
in-memory limiters are per process, so multi-instance needs a Redis adapter first (see ENGINEERING_DECISIONS).