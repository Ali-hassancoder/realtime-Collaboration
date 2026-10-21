# Backend image: persistent Node process (Socket.IO cannot run on serverless platforms).
# Build from the server/ directory:  docker build -t syncora-api ./server
# Config comes entirely from environment - never COPY the .env file into the image.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first so the layer cache survives source-only changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Drop root: the app only binds an unprivileged port and writes nothing to disk
USER node

# Overridable: Render/Fly inject PORT; the runtime guard refuses other unsafe prod combos
ENV PORT=10000
EXPOSE 10000

# Container platforms send SIGTERM then SIGKILL; src/server.js drains within 8 s of SIGTERM.
CMD ["node", "src/server.js"]
