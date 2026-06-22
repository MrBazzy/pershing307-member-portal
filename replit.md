# Pershing No. 307 Member Portal

Private membership management portal for General John J. Pershing Lodge No. 307. Members can access lodge documents, events, history, birthdays, tracing board, and manage their own profile. Administrators manage members, roles, the document library, and all lodge configuration.

## Run & Operate

| Command | Purpose |
|---------|---------|
| `pnpm --filter @workspace/api-server run dev` | Start API server (rebuilds then runs on `$PORT`, default 8080) |
| `pnpm --filter @workspace/portal run dev` | Start portal frontend (Vite dev server on `$PORT`) |
| `pnpm --filter @workspace/api-server test` | Run full test suite (258 pre-existing + 408 auth tests = 666 total) |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm --filter @workspace/db run push` | Push DB schema changes (dev only — never against production without a migration) |
| `pnpm --filter @workspace/api-spec run codegen` | Re-generate API hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) from `lib/api-spec/openapi.yaml` |

**After running codegen**, always rebuild the client lib or TypeScript picks up stale declarations:
```
cd lib/api-client-react && npx tsc --build
```

Required env: `DATABASE_URL` — Postgres connection string (automatically set in Replit).

## Stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **API:** Express 5 + Zod validation + Drizzle ORM (PostgreSQL)
- **Frontend:** React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui
- **Auth:** Session-based (express-session + connect-pg-simple), TOTP 2FA (speakeasy), WebAuthn passkeys (@simplewebauthn)
- **API contract:** OpenAPI 3.1 spec → Orval codegen → React Query hooks + Zod schemas
- **Emails:** Nodemailer (SMTP); falls back gracefully if SMTP not configured
- **Object storage:** Replit Object Storage (private bucket for documents)
- **Build:** esbuild (ESM bundle for API), Vite (portal)

## Where Things Live

```
lib/
  db/src/schema/          — Drizzle table definitions (source of truth for DB shape)
  api-spec/openapi.yaml   — OpenAPI 3.1 spec (source of truth for API contract)
  api-zod/src/generated/  — auto-generated Zod schemas (do not edit)
  api-client-react/src/   — auto-generated React Query hooks (do not edit)

artifacts/
  api-server/src/
    routes/               — one file per resource group
    middlewares/          — requireAuth, requireRole, requireDomain, require2FA
    lib/                  — config, email, audit, objectStorage, matrixPermissions, …
  portal/src/
    pages/                — one file per route/page
    components/           — shared UI components
```

## Architecture Decisions

- **Numeric permission levels, not named roles** — users hold a role with a `permissionLevel` integer. Routes call `requireRole(minLevel)` with a named constant (`VISITOR_LEVEL=10`, `MEMBER_LEVEL=20`, `SITE_ADMIN_LEVEL=80`, `PM_SUPER_LEVEL=90`). This allows a single middleware to enforce any boundary without enumerating role names. See `PERMISSION_MODEL.md`.

- **Lodge-agnostic DB schema** — every table has a `lodgeId` foreign key so the codebase can be reused for multiple lodges. For Pershing 307 there is exactly one lodge row. The `getLodgeId()` helper in `lib/config.ts` caches it.

- **Silent-filter access control on documents** — `GET /api/documents` returns an empty list (not 403) for users who can't see a folder's contents. This prevents folder-existence enumeration. Routes that create or modify documents use a hard 403.

- **Session-based auth with `forceLogout` flag** — when an admin deactivates a user or changes their role, the user's session rows are flagged `forceLogout=true`. The next request through `requireAuth()` detects this and destroys the session, logging the user out without invalidating their session cookie client-side.

- **DB config key-value store alongside env vars** — SMTP settings, session timeout, 2FA requirements, and invite expiry are stored in the `configuration` table (editable via admin UI) rather than env vars, because admins need to change them without a deploy. SMTP_PASS is the only exception — it must be an env var for security.

## Product

**For members:**
- Sign in with email/password (optional 2FA via TOTP or passkey)
- View and download lodge documents (access gated by domain/folder permissions)
- View upcoming events, birthdays, tracing board entries
- Browse lodge history, timeline, and historical documents
- View the Pershing bio page
- Manage own profile (date of birth, birthday visibility)

**For administrators (level 80+):**
- Full member management: create, invite, deactivate, manage roles and degrees
- Document library: folders, domains, upload, review pending uploads, manage access matrix
- Events and roadmap management
- Lodge history and tracing board content management
- View audit log and onboarding reports
- Configure all portal settings (SMTP, session timeout, 2FA policy, etc.)

**PM Super (level 90):**
- All admin capabilities plus access to PM-protected document domains
- Can set `domainProtectionLevel` on document domains
- Can grant/revoke PM-domain access for specific users

## User Preferences

- Keep tests passing: always run `pnpm --filter @workspace/api-server test` before marking work complete.
- Do not use `any` type in TypeScript without a comment explaining why.
- Authorization test suite at `artifacts/api-server/test/authorization.test.ts` is the living contract for all endpoint permission requirements — keep it up to date when adding routes.

## Gotchas

- **After codegen, rebuild the client lib:** `cd lib/api-client-react && npx tsc --build`. Otherwise the portal TypeScript compiler picks up stale `dist/` declarations from before codegen.
- **Drizzle null-set bug (v0.45.2):** `.set({ col: null })` on a nullable FK column silently no-ops. Use a raw `sql\`\`` template instead: `sql\`${table.col} = NULL\``.
- **esbuild override is pinned workspace-wide** in `pnpm-workspace.yaml` `overrides`. Updating esbuild requires changing both `overrides.esbuild` and `artifacts/api-server/devDependencies.esbuild`.
- **`POST /api/auth/logout` invalidates the calling agent's session.** In the authorization test suite, logout is tested in a dedicated `§2b` block using throw-away agents to avoid destroying the shared `visitorAgent`/`adminAgent` sessions used by subsequent tests.
- **2FA routes are nested:** `twoFactorRouter` is mounted inside `auth.ts` via `router.use("/2fa", ...)`. Full paths are `/api/auth/2fa/*`.
- **Bootstrap lockout:** `POST /api/bootstrap` is rejected with 403 once `bootstrapCompleted` is set in the `configuration` table. There is no undo — reseeding the DB is required to re-run bootstrap in dev.
- **Health route is `/api/healthz`** (not `/api/health`).

## Pointers

- Permission model: `PERMISSION_MODEL.md`
- Environment variables: `.env.example`
- Database design: `DATABASE_DESIGN.md`
- API contract: `lib/api-spec/openapi.yaml`
- Architecture: `TECHNICAL_ARCHITECTURE.md`
- Security scan results: `DOCUMENTATION_GAP_ANALYSIS.md`
- Workspace structure conventions: `.local/skills/pnpm-workspace/SKILL.md`
