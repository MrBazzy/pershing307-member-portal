---
name: Pershing307 Sprint 2A and later
description: Birthday Calendar, Roadmap Box, Audit Log, Document Access Matrix — completed features and key decisions
---

## Completed features

### Birthday Calendar (Sprint 2A)
- Upcoming birthdays widget on dashboard; DOB stored in users table
- Admin DOB edit UI — NOT YET implemented

### Roadmap Box (Sprint 2A)
- Dashboard roadmap summary widget using lodge-year + roadmap-item data

### Audit Log enhancements (AUDIT-LOG-001)
- `artifacts/portal/src/pages/admin/audit-log.tsx` — full `interpret()` frontend layer
- Covers ~105 AuditAction types across 14 categories; no backend changes needed

### Document Access Matrix — DB & Backend (Task #17)
Key decisions and non-obvious behaviors:

**matrixInitialized flag:** `document_folders.matrixInitialized (bool, default false)`.
Seeder (`seedFolderAccessMatrix`) checks this flag instead of counting existing rows.
Once seeded it's set true permanently — admins can clear the matrix without it being
auto-re-seeded on the next GET /document-folders request.

**isSystemRoot fallback rule:** `getEffectivePermissions` / `getEffectivePermissionsWithContext`
check `rootFolder.isSystemRoot` when matrix rows are absent:
- isSystemRoot=true → deny-all (admin-managed, no legacy fallback)
- isSystemRoot=false → fall back to legacy checkFolderAccess / canUploadToFolder
  (essential for test-created folders in uploadPermissions.test.ts)

**FolderAccessRow now includes isSystemRoot** — needed by matrix logic.
Both `FolderAccessRow` type and `folderAccessColumns` in `folderAccess.ts` include it.

**PATCH /documents/:id/status** now uses matrix canApprove for all transitions
except uploader-withdraw (which bypasses permissions). `isAdmin` variable was
repurposed to mean "acting with approve perms" for reviewedBy/reviewedAt stamping.

**Test count:** 178 → 221 (30 unit + 13 integration in two new test files)

**Admin endpoints:** GET/PUT /document-domains/:id/access-matrix (SITE_ADMIN_LEVEL).
PUT does full-replace with per-change audit rows (GRANTED/REVOKED per row + summary).

**Codegen note:** After adding new admin endpoints, orval must be run separately:
`cd lib/api-spec && npx orval --config ./orval.config.ts`
The `pnpm --filter @workspace/api-spec run codegen` command also runs typecheck and
can time out; running orval directly is safer. Both api-client-react AND api-zod
generated dirs will be cleaned and re-created.
