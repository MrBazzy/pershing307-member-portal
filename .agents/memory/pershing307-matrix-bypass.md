---
name: Pershing307 Document Matrix Bypass Patterns
description: Patterns where hardcoded level >= 80 checks bypassed the document access matrix, what was fixed, and the rule for writing new document routes.
---

## The Rule
All document and folder routes must derive visibility and action rights from `getEffectivePermissions(userId, folderId, lodgeId)`, not from `level >= SITE_ADMIN_LEVEL`. Admins still get full access, but the check is expressed as a shortcut (`isAdmin ? allTruePerms : await getEffectivePermissions(...)`) rather than a hard gate.

**Why:** The access matrix grants canView/canUpload/canApprove/canManage to specific roles (secretary, treasurer, etc.) below level 80. Hardcoded `level >= 80` locks out legitimate matrix-granted permissions.

## Non-document routes are correctly admin-only
Events, roadmap, tracing board, invitations, lodge config, audit log, degrees, domains, and the matrix editor itself are NOT governed by the document matrix. Leave those `requireRole(SITE_ADMIN_LEVEL)` guards alone.

## Bypass patterns fixed (and how to avoid repeating them)

### Pattern A — document list filtering
```ts
// WRONG
const isAdmin = level >= SITE_ADMIN_LEVEL;
const visible = docs.filter(d => isAdmin || d.status === "published");

// RIGHT — folderPerms/viewPerms already fetched for the canView gate above
const visible = docs.filter(d => isAdmin || folderPerms.canApprove || d.status === "published");
```
Affects: `GET /documents?folderId=` and `GET /document-folders/:id/documents`

### Pattern B — single-document download/view
```ts
// WRONG: fetch perms only for non-admins, use isAdmin in the status switch
// RIGHT: fetch perms once with admin shortcut, use canApprove in the switch
const folderPerms = isAdmin
  ? { canView: true, canUpload: true, canApprove: true, canManage: true }
  : await getEffectivePermissions(userId, doc.folderId, lodgeId);

if (!folderPerms.canView) { return 403; }

switch (doc.status) {
  case "pending_review":
  case "rejected":
    canSeeDoc = folderPerms.canApprove || isUploader;  // NOT: isAdmin || isUploader
    break;
}
```
Affects: `GET /documents/:id/download` and `GET /documents/:id/view`

### Pattern C — portal UI gated on isAdmin
- Status filter pills: `{isAdmin && ...}` → `{(isAdmin || folder?.canApprove) && ...}`
- Status badge / rejection reason: `(isUploader || isAdmin)` → `(isUploader || isAdmin || folder?.canApprove)`
- Delete/rename/manage controls: must check `folder?.canManage` (or `isAdmin`) not a hardcoded role level

### Pattern D — management controls only on admin page
Folder rename, subfolder create/rename/delete, and document delete were only surfaced in `/admin/document-management` which redirects non-admins. Now these controls also appear on the regular `/documents/:id` folder page, gated on `folder?.canManage`.

## How to apply when writing new document routes
1. Always call `getEffectivePermissions` for every document/folder route that isn't purely admin (matrix editor, domain linking).
2. For single-doc routes: fetch perms once with the admin shortcut, check canView first, then use canApprove/canManage in any status/action switch.
3. For portal components: gate visibility on the boolean fields returned by the folder API (`folder.canView`, `folder.canUpload`, `folder.canApprove`, `folder.canManage`) — never on `userLevel >= 80`.
