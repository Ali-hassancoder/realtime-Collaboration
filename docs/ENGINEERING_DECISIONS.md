# Engineering Decisions

Decision: Install only dependencies needed per phase.
Why: Smaller attack surface, less maintenance.
Alternative: Install the full stack on day one.
Rejected because: Unused packages add risk and noise.

Decision: ES modules (`"type": "module"`) on the server.
Why: Matches the client's module system and modern Node.
Alternative: CommonJS.
Rejected because: Mixed module styles across the codebase.

Decision: createApp() factory separate from server startup.
Why: Tests can load the app without a database or open port.
Alternative: Export a ready-made app from app.js with listen().
Rejected because: Hard to test.