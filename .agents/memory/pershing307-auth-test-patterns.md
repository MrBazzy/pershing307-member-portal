---
name: Pershing307 authorization test patterns
description: Hard-won lessons from building the exhaustive authorization test suite for the API server.
---

## Logout invalidates the shared agent session
`POST /api/auth/logout` must NEVER appear in an `it.each` list that is called with
a shared agent (`visitorAgent` / `adminAgent`). It destroys the session, making all
subsequent tests using that agent get 401 instead of expected 403.
**Fix:** test logout in a dedicated describe block using throw-away agents created
with `loginAgent(...)` inline.

## 2FA routes are nested inside /auth
The two-factor router is mounted via `router.use("/2fa", twoFactorRouter)` inside
auth.ts. Routes are at `/api/auth/2fa/*`, NOT `/api/auth/2fa` or `/api/2fa/*`.

## Profile self-service routes
`GET/PATCH date-of-birth` and `GET/PATCH birthday-visibility` live in `profile.ts`
mounted at `/api/profile/...`, not under `/api/users/...`.

## GET /api/documents requires folderId query param
The handler validates `folderId` before the permission level check. Without it,
even authenticated visitors get 400. With a valid (or dummy) folderId, visitors
get 200 with `{ documents: [] }` (silent filter, intentional design).

## POST /api/documents/request-upload level check order
Body validation (zod schema including `folderId`, `fileName`, `fileSize`, `mimeType`)
runs BEFORE the `if (level < MEMBER_LEVEL)` check. Must send a valid-shaped body
(including `fileSize`) to reach the level-check 403.

## PATCH /api/documents/:id level check order
Body validation runs, then document DB lookup (404 for dummy UUID), THEN level
check. Visitor gets 400 or 404, never 403, with empty/dummy body. Only test
unauthenticated → 401 reliably for this endpoint.

## teardownFixtures FK violation on two_factor_settings
Calling `POST /api/auth/2fa/enroll` with a test agent creates a `two_factor_settings`
row. teardownFixtures must delete those before deleting the user row. Import
`twoFactorSettingsTable` and add it to the cascade cleanup.

## Health route is /api/healthz
The health router has `router.get("/healthz", ...)`. Mounted with no path prefix
inside the `/api` router → full path is `/api/healthz`.

## GET /api/degree-definitions is auth-only
No `requireRole` middleware — any authenticated user accesses it. Lives in §2
(auth-only), not §5 (admin-only).
