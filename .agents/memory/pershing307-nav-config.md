---
name: Pershing307 Nav Config Feature
description: Configurable navigation menu — storage, audit action convention, HMR transient risk during codegen.
---

## What was built
- GET/PUT `/api/nav-config` route — stores `NavConfigItem[]` JSON in `configurationTable` under key `nav_config`.
- "Navigation Menu" tab added to admin Domains & Access Control page (`admin/domains.tsx`).
- `app-layout.tsx` reads config from API instead of hardcoded array; falls back gracefully.

## AuditAction must include every action string
`lib/db/src/schema/audit-logs.ts` exports `AuditAction` as a TypeScript union. esbuild (used for the API server build) does not type-check, so a missing action string does NOT fail the build — but it will cause TS errors and is bad practice. Always add new action strings to `AuditAction` before using them in a route.

**Why:** Without the entry, `pnpm typecheck` fails for the api-server. The runtime still works (the DB column is `text`, no DB-level enum), but the error noise masks real issues.

## HMR transient during orval codegen
When orval regenerates `lib/api-client-react/src/generated/api.ts`, Vite detects the delete+recreate and fires HMR. During the ~seconds between delete and write, any module that imports from `api.ts` will fail to hot-reload. Users on the portal at that moment may see "Failed to save" or similar errors that resolve once codegen finishes and HMR recovers.

**How to apply:** After codegen+lib rebuild, tell users to hard-refresh if they see unexpected errors. The transient is unavoidable but short-lived.
