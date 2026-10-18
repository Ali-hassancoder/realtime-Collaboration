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