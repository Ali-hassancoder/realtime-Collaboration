# Architecture

React (Vite) -> REST (Express) -> MongoDB (Mongoose)
React -> Socket.IO client -> Node HTTP server -> Socket.IO server

- REST handles CRUD and history. Socket.IO handles live events only.
- server.js: startup only. app.js: Express config. sockets/: realtime. modules/: features (from Phase 2).