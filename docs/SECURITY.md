# Security

## Authentication (Phase 2)
- Passwords: bcrypt (cost 12), max 72 chars. Never logged or returned (select:false + toJSON transform).
- Cookies: httpOnly, SameSite=Lax, Secure in production. Refresh cookie path-scoped to /api/auth.
- Login does not reveal whether an email exists (same error + dummy hash compare for timing).
- Registration does reveal duplicate emails (409). Accepted trade-off for usability; rate limited.
- Rate limits: login 10 failed/15min/IP, register 10/hour/IP, refresh 60/15min/IP.

## Not yet implemented (planned)
- Email verification and password reset: need an email provider. Design: single-use random token,
  stored hashed with expiry (like sessions), emailed as link, invalidates all sessions on reset.
- Refresh-token reuse detection (token families) and "log out everywhere".
- Account lockout / CAPTCHA.
- CSRF tokens (only needed if client and API end up on different sites).
- trust proxy setting for rate limiting behind a reverse proxy (Phase 17).

## Workspaces (Phase 3)
- Every workspace route resolves the caller's membership server-side; client-sent roles are ignored.
- Role changes require outranking both target and new role; 'owner' cannot be assigned via API.
- Invite tokens: 32 random bytes, stored as SHA-256, single use, 7-day expiry, rate limited.
- Known limitation: emails are not verified yet, so the email-match check on invites is a second
  factor, not proof of mailbox ownership. The token is the real secret. Email verification is planned.
- Known limitation: invite tokens appear in the client URL path; share links over private channels.
- Password change revokes all refresh sessions. A stolen access token can still work for up to 15 minutes.