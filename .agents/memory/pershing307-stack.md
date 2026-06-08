---
name: Pershing307 Stack & Conventions
description: Key architectural decisions, lib build workflow, auth patterns, and config values for the Pershing307 member portal project.
---

## Stack
- React + Vite frontend (portal, port 3000)
- Express 5 backend (api-server, port 8080)
- PostgreSQL + Drizzle ORM
- wouter for routing (Link renders own `<a>`; base = `import.meta.env.BASE_URL`)
- orval codegen: run `cd lib/api-spec && pnpm exec orval --config orval.config.ts`

## Critical: Rebuild lib after codegen
The portal's tsconfig uses project references to `lib/api-client-react`, which compiles to `dist/` with `composite: true`.
After running orval codegen, **must** run `pnpm run typecheck:libs` at the workspace root to regenerate declarations — otherwise TypeScript shows "no exported member" errors for new hooks even though the source files are correct.

## Auth patterns
- `mustChangePassword: true` is set on invitation acceptance; cleared on PATCH /auth/profile or POST /auth/change-password
- Bootstrap admin: admin@pershing307.org / SecurePass123! (PM Super Administrator, permissionLevel 90)
- `ProtectedRoute` redirects to /setup if `user.mustChangePassword === true`
- SetupRoute: protected (requires auth) but does NOT check mustChangePassword (avoids redirect loop)
- 2FA required for: Site Admins and PM Super Admins (role permissionLevel >= 70/90); stored in config key `require_2fa_roles`

## Config system
- READ_ONLY_KEYS: lodge/SMTP keys (set via env or setup)
- SMTP_PASS is an env secret only, never in DB
- Degree definitions stored in config key `degree_definitions` as JSON; defaults: EA(1), FC(2), MM(3), PM(4)
- Writable config keys: session_timeout_min, lockout_max_attempts, lockout_duration_min, invite_expiry_days, reset_expiry_hours, require_2fa_roles

## Domain access
- Not automatically granted to any role; must be explicitly granted per user by PM Super Admin (permissionLevel >= 90)
- Domain routes: GET/POST /users/:id/domains, DELETE /users/:id/domains/:domainId; also duplicated at /domains router

**Why:** These patterns were non-obvious and required multiple interconnected decisions during Sprint 1 hardening.
