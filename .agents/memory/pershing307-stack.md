---
name: Pershing307 Stack & Conventions
description: Portal stack, lib build, auth patterns, key config values, known gotchas.
---

## Stack
- React+Vite portal (port 3000 via $PORT), Express 5 API (port 8080)
- PostgreSQL + Drizzle ORM (`lib/db/src/schema/`)
- Orval codegen: `cd lib/api-spec && pnpm exec orval --config orval.config.ts`
  then `pnpm -w run typecheck:libs` — output: `lib/api-client-react/src/generated/api.ts` + `api.schemas.ts`
- Auth: express-session + connect-pg-simple (plaintext sid, not hashed)
- Session data: `{userId, lodgeId, twoFactorVerified, forceLogout?}`

## Auth flags (users table)
- `mustChangePassword`: ONLY for admin-forced password resets (not new invite users)
- `profileSetupRequired`: routes new invitation users to Profile→Privacy wizard
- `hasTemporaryPassword`: derived — `tempPasswordExpiresAt != null && > now()`
- ProtectedRoute gate: `mustChangePassword || profileSetupRequired`

## Known race condition (FIXED in ADMIN-PWD-004)
`await refetch(); setLocation("/dashboard")` is unsafe — TanStack Query's
refetch Promise resolves before React applies the cache update to component
state. ProtectedRoute can see stale mustChangePassword=true and redirect back
to /setup. Fix: use `queryClient.setQueryData(getGetCurrentUserQueryKey(), ...)` 
to synchronously clear the flags before navigating.

**Why:** `setQueryData` writes to the cache synchronously; `useSyncExternalStore`
picks it up in the same render that processes the Wouter navigation.

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
