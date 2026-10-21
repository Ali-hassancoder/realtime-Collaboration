# Real-Time Collaboration Platform

MERN + Socket.IO team collaboration app. See `docs/` for architecture and decisions.

## Run locally
1. Start MongoDB (local or Atlas).
2. `cd server && cp .env.example .env` and fill in `MONGO_URI`
3. `npm run dev` (server on :5000)
4. In another terminal: `cd client && cp .env.example .env && npm run dev` (client on :5173)

## Tests
`cd server && npm test`

## Deploy
The SPA goes on any static host; the API needs one persistent Node process (Socket.IO). Fill in
`server/.env.production.example` as platform env keys, or build the container: `docker build -t syncora-api ./server`.
The server refuses to boot in production with an unsafe env combination (see `src/config/runtimeGuard.js`) and
answers `/api/health` for platform probes. Details: `docs/ARCHITECTURE.md` (Deployment topology).