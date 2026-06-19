---
name: Pershing307 Sprint 2A and later
description: Birthday Calendar, Roadmap Box, Audit Log improvements, Document Access Matrix — what was built and key decisions
---

## Completed features

### Birthday Calendar (Sprint 2A)
- Added upcoming birthdays widget to dashboard
- DB: DOB stored in users table; birthday API filters within next 30 days

### Roadmap Box (Sprint 2A)
- Dashboard roadmap summary widget
- Uses lodge-year + roadmap-item data

### DOB Edit (pending)
- Admin/users DOB edit UI — NOT YET implemented (noted in Sprint 2A)

### Audit Log enhancements (AUDIT-LOG-001)
- Complete rewrite of `artifacts/portal/src/pages/admin/audit-log.tsx`
- Pure frontend interpretation layer — no backend changes needed
- `interpret(action, detail, actorEmail, targetId)` → { category, result, summary, details?, recommendation? }
- Covers all ~105 AuditAction types across 14 categories

### Document Access Matrix — DB & Backend (Task #17)
- New `folder_access_matrix` table (`lib/db/src/schema/folder-access-matrix.ts`)
  - Columns: id, lodgeId, folderId, subjectType ("role"|"degree"), subjectKey, permission ("view"|"upload"|"approve"|"manage")
  - Unique constraint on (folderId, subjectType, subjectKey, permission)
  - FK: folderId → document_folders(id) ON DELETE CASCADE
- Default matrix seeded for all 9 system root folders in `artifacts/api-server/src/lib/matrixPermissions.ts`
  - `DEFAULT_DOMAIN_MATRIX` keyed by domain slug
  - `seedFolderAccessMatrix(lodgeId)` called from GET /document-folders on each request (no-op when already seeded)
- `getEffectivePermissions(userId, folderId, lodgeId)` — async, walks up to root ancestor, checks matrix, falls back to legacy domain logic when no matrix rows exist
- `getEffectivePermissionsWithContext(userCtx, folderId, lodgeId, allFolders, allMatrixRows)` — batch-friendly variant for root list
- GET /document-folders (root list) now uses matrix canView for filtering
- GET /document-folders/:id now returns canView, canUpload, canApprove, canManage in response
- POST /documents/request-upload now uses getEffectivePermissions for both access + upload gate
- Admin endpoints: GET/PUT /document-domains/:id/access-matrix (SITE_ADMIN_LEVEL)
- Audit actions: ACCESS_MATRIX_UPDATED, ACCESS_MATRIX_PERMISSION_GRANTED, ACCESS_MATRIX_PERMISSION_REVOKED
- Legacy fallback: folders without matrix rows (e.g. test-created folders) fall back to old allowedRoleSlugs domain logic — critical for existing upload permission tests passing

**Why legacy fallback matters:** The uploadPermissions.test.ts creates test folders with domain slugs (e.g. __uptest__meeting-minutes) that never get matrix rows. Without the fallback, getEffectivePermissions would return all-false for those folders, breaking the test assertions about upload-rights 403s.

**Test count:** 178 → 208 (30 new unit tests in `artifacts/api-server/test/matrixPermissions.unit.test.ts`)

## Key files
- `lib/db/src/schema/folder-access-matrix.ts` — schema
- `artifacts/api-server/src/lib/matrixPermissions.ts` — all matrix logic
- `artifacts/api-server/src/routes/document-domains.ts` — GET/PUT access-matrix endpoints
- `artifacts/portal/src/pages/admin/audit-log.tsx` — full page + interpret() function
