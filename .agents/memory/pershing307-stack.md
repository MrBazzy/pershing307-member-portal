---
name: Pershing307 Stack & Conventions
description: Portal stack, lib build, auth patterns, key config values, known gotchas.
---

## Stack
- React+Vite portal (port via $PORT, base path `/`), Express 5 API (port 8080)
- PostgreSQL + Drizzle ORM (`lib/db/src/schema/`)
- Orval codegen: `cd lib/api-spec && pnpm exec orval --config orval.config.ts`
  then `pnpm -w run typecheck:libs` — output: `lib/api-client-react/src/generated/api.ts` + `api.schemas.ts`
- Auth: express-session + connect-pg-simple (plaintext sid, not hashed)
- Session data: `{userId, lodgeId, twoFactorVerified, forceLogout?}`

## Auth flags (users table)
- `mustChangePassword`: ONLY for admin-forced password resets (not new invite users)
- `profileSetupRequired`: routes new invitation users to Profile→Privacy wizard; cleared by PATCH /auth/profile
- `hasTemporaryPassword`: derived — `tempPasswordExpiresAt != null && > now()`
- ProtectedRoute gate: `mustChangePassword || profileSetupRequired`

## Forced-reset loop (FIXED in ADMIN-PWD-004 v3)
Root cause: two interacting bugs.
1. When a user has BOTH profileSetupRequired=true AND mustChangePassword=true,
   after password change ProtectedRoute redirects back to /setup. SetupPage remounts fresh.
2. TanStack Query staleTime=0 triggers an immediate background refetch. If a refetch
   was in-flight from the 30s poll interval, it can overwrite a setQueryData call and
   restore hasTemporaryPassword=true before SetupPage's useEffect fires → latch re-arms.

Fix:
- Use `window.location.replace(`${BASE_URL}/dashboard`)` after password change.
  Full page reload = no React/TanStack state, no races. Fresh /me from server is
  the single source of truth. mustChangePassword=false and hasTemporaryPassword=false
  guaranteed (DB updated before 200 response sent).
- Hardened latch: `user?.mustChangePassword && user?.hasTemporaryPassword` (both).
  After password change mustChangePassword=false permanently; even a stale
  hasTemporaryPassword=true from a background refetch cannot re-arm the latch.

**Why window.location.replace over queryClient.setQueryData:**
setQueryData with staleTime=0 marks data as immediately stale. Any in-flight
refetch from a 30s poll interval completes after setQueryData overwrites it.
window.location.replace destroys the entire TanStack cache — no in-flight requests.

## Session invalidation
- `invalidateUserSessions(userId, exceptSid)` — DELETEs sessions, keeps current
- `markSessionsAsForceLogout(userId)` — sets forceLogout:true in session JSON
- `requireAuth` checks `req.session.forceLogout` on every request

## Contract tests
52 tests: `pnpm --filter @workspace/api-server test`

## DB migration
`cd lib/db && pnpm run push` (no migration files, direct schema push)

## Admin credentials (dev)
admin@pershing307.org / SecurePass123!
Admin ID: 763db701-f08b-4124-87a9-2ac4db964e24
Barry ID: d725b3b2-c49f-408c-85d0-f87db9743d4c / barry@fmdmail.be
