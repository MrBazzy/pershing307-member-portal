---
name: Pershing307 Stack & Conventions
description: Portal stack, lib build, auth patterns, key config values, known gotchas.
---

## Stack
- React+Vite portal (port via $PORT, base path `/`), Express 5 API (port 8080)
- PostgreSQL + Drizzle ORM (`lib/db/src/schema/`)
- Orval codegen: `cd lib/api-spec && pnpm exec orval --config orval.config.ts`
  then `pnpm -w run typecheck:libs` — output: `lib/api-client-react/src/generated/api.ts` + `api.schemas.ts`
- **IMPORTANT**: Orval codegen currently crashes OOM in this environment before finishing.
  It cleans the output folder first, leaving generated files wiped. Workaround:
  1. Restore from git: `git show HEAD:lib/api-client-react/src/generated/api.ts > .../api.ts`  (same for api.schemas.ts)
  2. Manually append new hooks/types following the exact patterns in those files
  3. The package exports via `"exports": { ".": "./src/index.ts" }` — Vite reads TypeScript source directly, no tsc rebuild needed
  4. `tsc --build` in api-client-react also times out — skip it; the portal works without it
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

## Role model (simplified — ROLE-SIMPLIFICATION-001)
Administrator (level 70) was removed. Final model:
- Visitor 10, Member 20, lodge officer roles 30–60, Site Administrator 80, PM Super Administrator 90
- All former ADMINISTRATOR_LEVEL (70) gates are now SITE_ADMIN_LEVEL (80)
- PRIVILEGED_ROLE_SLUGS = {site-administrator, pm-super-administrator}
- Site Administrator owns all operational administration (users, invites, degrees, audit, config)
- PM Super Administrator owns governance (domain assignment, role assignment, emergency)

## DB migration
`cd lib/db && pnpm run push` (no migration files, direct schema push)

## Orval mutation hook call convention
Orval-generated mutation hooks wrap the request body in `{ data: ... }` — do NOT pass body fields directly.
- POST: `mutate({ data: { title, description } })`
- PUT with path param: `mutate({ id: "...", data: { title } })`
After adding new routes, restart the API server workflow to pick up new route files.

## Document visibility — two routes, same rule
The portal fetches folder documents via `GET /document-folders/:id/documents`
(in `document-folders.ts`), NOT `GET /documents?folderId=` (`documents.ts`).
Both routes have their own visibility filter. Any change to who sees what
must be applied to **both** files.
Current rule: `folderPerms.canManage || folderPerms.canApprove` see all statuses;
others see only `published`. Uses effective matrix perms — NOT a raw level check.

## Site Admin bypass — past_master_protected (DOCUMENT-ACCESS-BUG-002)
`matrixPermissions.ts` constant `PM_SUPER_LEVEL = 90`.
- Standard domains: Site Admin (80) still gets bypass (full access without matrix entry).
- past_master_protected domains: bypass is SKIPPED for level < 90; must have explicit matrix row.
- All 4 access paths enforce this: folder listing, GET /folders/:id, GET /folders/:id/documents,
  GET /documents/:id/view, GET /documents/:id/download.
- Denied access for Site Admin on past_master_protected → writes DOCUMENT_ACCESS_DENIED audit log.
- `documents.ts` also needs `PM_SUPER_LEVEL = 90` constant (alongside `SITE_ADMIN_LEVEL = 80`).
- Acceptance tests: `test/documentAccessBypass.test.ts` (10 tests). Total suite: 258.

## Rich Text / History Management
- Rich text editor: TipTap (@tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-placeholder)
- Editor component: `artifacts/portal/src/components/history/rich-text-editor.tsx` (uncontrolled, key-remount pattern)
- Admin editing: `/admin/history`, `/admin/history/timeline`, `/admin/history/documents` (all ADMIN_LEVEL)
- Admin layout: `artifacts/portal/src/components/history/admin-history-layout.tsx`
- Public history pages: fully read-only — no isAdmin checks remain
- HTML sanitized on server with sanitize-html before DB save (PUT /page in history.ts)
- Content rendering: `dangerouslySetInnerHTML` with legacy plain-text → `<p>` fallback via `prepareContent()`
- Timeline "Present" era: year=9999 in DB, displayed as "Present" in UI
- Timeline seed (6 entries 1959–Present) inserted via SQL into `history_timeline_entries`

## Object Storage
- Provisioned: bucket `replit-objstore-e1bd3a42-1b17-4052-9601-6d2a90453932`
- Env vars set: DEFAULT_OBJECT_STORAGE_BUCKET_ID, PUBLIC_OBJECT_SEARCH_PATHS, PRIVATE_OBJECT_DIR
- Server libs: `artifacts/api-server/src/lib/objectStorage.ts` + `objectAcl.ts`
- Storage router: `artifacts/api-server/src/routes/storage.ts` — GET /storage/objects/* (requireAuth), GET /storage/public-objects/* (public)
- objectPath format: `/objects/uploads/<uuid>` — serve via `/api/storage/objects/uploads/<uuid>`
- File type validation on server in history route (PDF, JPG, PNG, DOCX only)
- history_documents.fileUrl stores the objectPath string

## Admin credentials (dev)
admin@pershing307.org / SecurePass123!
Admin ID: 763db701-f08b-4124-87a9-2ac4db964e24
Barry ID: d725b3b2-c49f-408c-85d0-f87db9743d4c / barry@fmdmail.be
