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
- Bootstrap admin user: admin@pershing307.org (PM Super Administrator, permissionLevel 90). Credentials are NOT stored here — check the secure setup/bootstrap config if needed.
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

## Validation parity & distinct error reasons
- Frontend (zod) and backend (`passwordSchema` in api-server/src/lib/password.ts) password rules MUST stay in sync. They drifted once: backend required upper/lower/digit/special + 12 chars, frontend only required 12 chars → a user-chosen weak password passed the form but failed the server.
- Auth/onboarding handlers must look up by token/id ALONE, then diagnose state in order (invalid → revoked → accepted → expired → password invalid → user exists) and return a DISTINCT message + machine `code`. Do NOT fold all failures into one query that yields a single generic "invalid or expired" 404.
- **Why:** A fresh invitation reported "invitation expired" because the frontend's catch-all `onError` toast hardcoded an "expired" message for ANY error (the real error was 400 password-complexity). Two compounding bugs: validation drift + generic error mapping.
- **How to apply:** Frontend should surface `ApiError.data.error` (custom-fetch throws `ApiError` with parsed body in `.data`), never a hardcoded reason. Keep client/server validation schemas identical.

## API path coupling (server mount ↔ openapi)
- The express route mount path MUST match the path in the openapi spec (the orval client is generated from openapi). A mismatch produces a SILENT 404 — the page renders an empty state with no error, because inserts/handler are fine and only the URL is wrong. Symptom: a feature looks totally broken while the DB clearly has data.
- **Why:** Audit Log showed "No entries" while dozens of rows existed — server mount and the openapi/client path had diverged.
- **How to apply:** When adding or renaming any route, grep the openapi spec for the same path before assuming a read bug is in the handler or DB.

## API contract test (guards path coupling)
- `artifacts/api-server` has a vitest suite (`pnpm --filter @workspace/api-server test`, also registered as the `test` validation command). Tests run serially against the real dev Postgres + the real express app via supertest.
- `test/contract.test.ts` parses `lib/api-spec/openapi.yaml` and probes every operation at `/api`+path; a route is "missing" only when status is 404 AND the body is Express's default HTML (`Cannot <METHOD> ...`). A handler JSON 404 (resource-not-found) is treated as present. This is the automated guard against the silent mount↔openapi divergence.
- **Why:** Express 5's unmatched-route 404 is an HTML page, not plain text — match `Cannot <METHOD>` anywhere, not anchored at start, or the check passes vacuously.
- Auth fixtures (`test/helpers.ts`) seed a below-admin + admin user (slugs/emails prefixed `__contract_test_`) in the existing lodge and log in via the real `/api/auth/login` (users created without 2FA so login returns a session directly).

**Why:** These patterns were non-obvious and required multiple interconnected decisions during Sprint 1 hardening.
