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

Decision: JWT access token + opaque refresh token, both in httpOnly cookies.
Why: JS cannot read the tokens (XSS-resistant); refresh tokens are revocable because they live in the DB (hashed).
Alternative: JWT in localStorage.
Rejected because: any XSS can steal it, and it cannot be revoked server-side.

Decision: Refresh tokens are single-use (rotated) and stored as SHA-256 hashes.
Why: A stolen DB dump does not yield usable tokens; replay of an old token fails.
Alternative: Long-lived JWT refresh tokens.
Rejected because: no revocation, no rotation.

Decision: bcryptjs instead of native bcrypt/argon2.
Why: No native build step (reliable on Windows). Cost factor 12.
Alternative: argon2.
Rejected because: native build friction for now; can migrate later (hash upgrade on login).

Decision: Memberships in a separate WorkspaceMember collection with a role field.
Why: Queried by user and by workspace; roles are per membership; avoids unbounded arrays in one document.
Alternative: Embed members array in Workspace.
Rejected because: Hard to query "my workspaces", contention on one document, size limits.

Decision: Non-members receive 404 (not 403) for workspace resources.
Why: Prevents confirming that a workspace ID exists.
Alternative: 403 for non-members.
Rejected because: Leaks existence.

Decision: Invitations are one-time links (hashed token) instead of emails, for now.
Why: No email provider yet; the invitee must be logged in with the invited address.
Alternative: Add users directly by email.
Rejected because: Requires the user to exist already and gives no consent step.
Revisit: Phase 11 (notifications) / when an email provider is chosen.

Decision: Central permission map plus a rank comparison (workspace.permissions.js).
Why: One place to audit; "must outrank the target" prevents admins from managing admins.
Alternative: Inline role checks in each controller.
Rejected because: Easy to miss or drift.