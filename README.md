# Real-Time Collaboration Platform

MERN + Socket.IO team collaboration app. See `docs/` for architecture and decisions.

## Run locally
1. Start MongoDB (local or Atlas).
2. `cd server && cp .env.example .env` and fill in `MONGO_URI`
3. `npm run dev` (server on :5000)
4. In another terminal: `cd client && cp .env.example .env && npm run dev` (client on :5173)

## Tests
`cd server && npm test`