/**
 * Matrix-based folder permission helper.
 *
 * Reads the `folder_access_matrix` table to compute effective permissions
 * (canView, canUpload, canApprove, canManage) for a given user + folder.
 *
 * Falls back to the legacy domain-based / accessPolicy logic when no matrix
 * rows exist for the folder (preserves behaviour for test-created folders that
 * are not part of the seeded system roots).
 */

import { db } from "@workspace/db";
import {
  folderAccessMatrixTable,
  documentFoldersTable,
  protectedDomainsTable,
} from "@workspace/db/schema";
import type { MatrixPermission, MatrixSubjectType } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getUserVisibilityContext } from "./visibility";
import {
  checkFolderAccess,
  canUploadToFolder,
  folderAccessColumns,
} from "./folderAccess";
import type { FolderAccessRow } from "./folderAccess";

const SITE_ADMIN_LEVEL = 80;
const MEMBER_LEVEL = 20;

export type EffectivePermissions = {
  canView: boolean;
  canUpload: boolean;
  canApprove: boolean;
  canManage: boolean;
};

export type MatrixEntryDef = {
  subjectType: MatrixSubjectType;
  subjectKey: string;
  permission: MatrixPermission;
};

// ── Default matrix per system domain slug ────────────────────────────────────

const ADMIN_APPROVE_MANAGE: MatrixEntryDef[] = [
  { subjectType: "role", subjectKey: "site-administrator", permission: "approve" },
  { subjectType: "role", subjectKey: "pm-super-administrator", permission: "approve" },
  { subjectType: "role", subjectKey: "site-administrator", permission: "manage" },
  { subjectType: "role", subjectKey: "pm-super-administrator", permission: "manage" },
];

function officerEntries(
  uploadSlug: string,
  viewSlugs: string[],
  uploadSlugs: string[],
  approveSlugs: string[],
): MatrixEntryDef[] {
  return [
    ...viewSlugs.map((s) => ({ subjectType: "role" as const, subjectKey: s, permission: "view" as const })),
    ...uploadSlugs.map((s) => ({ subjectType: "role" as const, subjectKey: s, permission: "upload" as const })),
    ...approveSlugs.map((s) => ({ subjectType: "role" as const, subjectKey: s, permission: "approve" as const })),
    { subjectType: "role", subjectKey: "site-administrator", permission: "manage" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "manage" },
  ];
}

export const DEFAULT_DOMAIN_MATRIX: Record<string, MatrixEntryDef[]> = {
  "general-documents": [
    { subjectType: "role", subjectKey: "member", permission: "view" },
    { subjectType: "role", subjectKey: "member", permission: "upload" },
    { subjectType: "role", subjectKey: "secretary", permission: "approve" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "approve" },
    { subjectType: "role", subjectKey: "past-master", permission: "approve" },
    ...ADMIN_APPROVE_MANAGE,
  ],
  "meeting-minutes": [
    { subjectType: "role", subjectKey: "member", permission: "view" },
    { subjectType: "role", subjectKey: "secretary", permission: "upload" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "upload" },
    { subjectType: "role", subjectKey: "past-master", permission: "upload" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "secretary", permission: "approve" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "approve" },
    { subjectType: "role", subjectKey: "past-master", permission: "approve" },
    ...ADMIN_APPROVE_MANAGE,
  ],
  "secretary-documents": officerEntries(
    "secretary-documents",
    ["secretary", "worshipful-master", "site-administrator", "pm-super-administrator"],
    ["secretary", "worshipful-master", "site-administrator", "pm-super-administrator"],
    ["secretary", "worshipful-master", "site-administrator", "pm-super-administrator"],
  ),
  "treasury-documents": officerEntries(
    "treasury-documents",
    ["treasurer", "worshipful-master", "site-administrator", "pm-super-administrator"],
    ["treasurer", "worshipful-master", "site-administrator", "pm-super-administrator"],
    ["treasurer", "worshipful-master", "site-administrator", "pm-super-administrator"],
  ),
  "wm-documents": officerEntries(
    "wm-documents",
    ["worshipful-master", "site-administrator", "pm-super-administrator"],
    ["worshipful-master", "site-administrator", "pm-super-administrator"],
    ["worshipful-master", "site-administrator", "pm-super-administrator"],
  ),
  "ea-ritual": [
    { subjectType: "degree", subjectKey: "1", permission: "view" },
    { subjectType: "role", subjectKey: "past-master", permission: "view" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "view" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "view" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "view" },
    { subjectType: "role", subjectKey: "past-master", permission: "upload" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "upload" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "past-master", permission: "approve" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "approve" },
    ...ADMIN_APPROVE_MANAGE,
  ],
  "fc-ritual": [
    { subjectType: "degree", subjectKey: "2", permission: "view" },
    { subjectType: "role", subjectKey: "past-master", permission: "view" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "view" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "view" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "view" },
    { subjectType: "role", subjectKey: "past-master", permission: "upload" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "upload" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "past-master", permission: "approve" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "approve" },
    ...ADMIN_APPROVE_MANAGE,
  ],
  "mm-ritual": [
    { subjectType: "degree", subjectKey: "3", permission: "view" },
    { subjectType: "role", subjectKey: "past-master", permission: "view" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "view" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "view" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "view" },
    { subjectType: "role", subjectKey: "past-master", permission: "upload" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "upload" },
    { subjectType: "role", subjectKey: "site-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "pm-super-administrator", permission: "upload" },
    { subjectType: "role", subjectKey: "past-master", permission: "approve" },
    { subjectType: "role", subjectKey: "worshipful-master", permission: "approve" },
    ...ADMIN_APPROVE_MANAGE,
  ],
  "pm-ritual": officerEntries(
    "pm-ritual",
    ["past-master", "worshipful-master", "site-administrator", "pm-super-administrator"],
    ["past-master", "worshipful-master", "site-administrator", "pm-super-administrator"],
    ["past-master", "worshipful-master", "site-administrator", "pm-super-administrator"],
  ),
};

// ── Seeding ──────────────────────────────────────────────────────────────────

/**
 * Seeds the default access matrix rows for all system root folders that have
 * a matching domain slug in DEFAULT_DOMAIN_MATRIX but no matrix rows yet.
 * Safe to call on every request — it is a no-op when the matrix is already
 * populated.
 */
export async function seedFolderAccessMatrix(lodgeId: string): Promise<void> {
  const roots = await db
    .select({
      id: documentFoldersTable.id,
      domainSlug: protectedDomainsTable.slug,
    })
    .from(documentFoldersTable)
    .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
    .where(
      and(
        eq(documentFoldersTable.lodgeId, lodgeId),
        eq(documentFoldersTable.isSystemRoot, true),
      ),
    );

  for (const root of roots) {
    const slug = root.domainSlug;
    if (!slug || !DEFAULT_DOMAIN_MATRIX[slug]) continue;

    const existing = await db
      .select({ id: folderAccessMatrixTable.id })
      .from(folderAccessMatrixTable)
      .where(eq(folderAccessMatrixTable.folderId, root.id))
      .limit(1);

    if (existing.length > 0) continue;

    const entries = DEFAULT_DOMAIN_MATRIX[slug].map((e) => ({
      lodgeId,
      folderId: root.id,
      subjectType: e.subjectType,
      subjectKey: e.subjectKey,
      permission: e.permission,
    }));

    await db.insert(folderAccessMatrixTable).values(entries).onConflictDoNothing();
  }
}

// ── Permission computation ────────────────────────────────────────────────────

function computeFromMatrix(
  matrixRows: Array<{ subjectType: string; subjectKey: string; permission: string }>,
  level: number,
  roleSlugs: string[],
  maxDegree: number,
): EffectivePermissions {
  function hasPermission(permission: string): boolean {
    for (const row of matrixRows) {
      if (row.permission !== permission) continue;
      if (row.subjectType === "role") {
        if (row.subjectKey === "member") {
          if (level >= MEMBER_LEVEL) return true;
        } else {
          if (roleSlugs.includes(row.subjectKey)) return true;
        }
      } else if (row.subjectType === "degree") {
        const required = parseInt(row.subjectKey, 10);
        if (!isNaN(required) && maxDegree >= required) return true;
      }
    }
    return false;
  }

  return {
    canView: hasPermission("view"),
    canUpload: hasPermission("upload"),
    canApprove: hasPermission("approve"),
    canManage: hasPermission("manage"),
  };
}

function computeFromLegacy(
  folder: FolderAccessRow,
  level: number,
  roleSlugs: string[],
  maxDegree: number,
): EffectivePermissions {
  const canView = checkFolderAccess(folder, level, roleSlugs, maxDegree);
  const canUpload = canView && canUploadToFolder(folder, level);
  const canApprove = level >= SITE_ADMIN_LEVEL;
  const canManage = level >= SITE_ADMIN_LEVEL;
  return { canView, canUpload, canApprove, canManage };
}

/**
 * Walks up to the root ancestor folder and returns both the root folder row
 * (for legacy fallback) and its ID (for matrix lookup).
 */
async function resolveRootFolder(
  folderId: string,
  lodgeId: string,
): Promise<FolderAccessRow | null> {
  const allRows = await db
    .select(folderAccessColumns)
    .from(documentFoldersTable)
    .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
    .where(eq(documentFoldersTable.lodgeId, lodgeId));

  const map = new Map(allRows.map((r) => [r.id, r as FolderAccessRow]));
  const target = map.get(folderId) ?? null;
  if (!target) return null;

  let cur: FolderAccessRow = target;
  for (let i = 0; i < 10; i++) {
    if (!cur.parentId) return cur;
    const parent = map.get(cur.parentId);
    if (!parent) return cur;
    cur = parent;
  }
  return cur;
}

/**
 * Returns effective permissions for a user on a folder.
 * Admins (≥ SITE_ADMIN_LEVEL) always receive all permissions.
 * Uses the matrix when available; falls back to legacy domain logic otherwise.
 */
export async function getEffectivePermissions(
  userId: string,
  folderId: string,
  lodgeId: string,
): Promise<EffectivePermissions> {
  const { maxPermLevel: level, roleSlugs, maxDegree } = await getUserVisibilityContext(userId);

  if (level >= SITE_ADMIN_LEVEL) {
    return { canView: true, canUpload: true, canApprove: true, canManage: true };
  }
  if (level < MEMBER_LEVEL) {
    return { canView: false, canUpload: false, canApprove: false, canManage: false };
  }

  const rootFolder = await resolveRootFolder(folderId, lodgeId);
  if (!rootFolder) {
    return { canView: false, canUpload: false, canApprove: false, canManage: false };
  }

  const matrixRows = await db
    .select({
      subjectType: folderAccessMatrixTable.subjectType,
      subjectKey: folderAccessMatrixTable.subjectKey,
      permission: folderAccessMatrixTable.permission,
    })
    .from(folderAccessMatrixTable)
    .where(
      and(
        eq(folderAccessMatrixTable.folderId, rootFolder.id),
        eq(folderAccessMatrixTable.lodgeId, lodgeId),
      ),
    );

  if (matrixRows.length > 0) {
    return computeFromMatrix(matrixRows, level, roleSlugs, maxDegree);
  }

  // System root folders are always managed by the matrix.
  // An empty matrix means "deny all" — no legacy fallback.
  // Non-system folders (e.g. test-created folders) fall back to legacy domain logic.
  if (rootFolder.isSystemRoot) {
    return { canView: false, canUpload: false, canApprove: false, canManage: false };
  }
  return computeFromLegacy(rootFolder, level, roleSlugs, maxDegree);
}

/**
 * Variant that accepts a pre-fetched user context — useful when computing
 * permissions for multiple folders to avoid repeated DB calls.
 */
export async function getEffectivePermissionsWithContext(
  userContext: { maxPermLevel: number; roleSlugs: string[]; maxDegree: number },
  folderId: string,
  lodgeId: string,
  allFolderRows: FolderAccessRow[],
  allMatrixRows: Array<{ folderId: string; subjectType: string; subjectKey: string; permission: string }>,
): Promise<EffectivePermissions> {
  const { maxPermLevel: level, roleSlugs, maxDegree } = userContext;

  if (level >= SITE_ADMIN_LEVEL) {
    return { canView: true, canUpload: true, canApprove: true, canManage: true };
  }
  if (level < MEMBER_LEVEL) {
    return { canView: false, canUpload: false, canApprove: false, canManage: false };
  }

  const map = new Map(allFolderRows.map((r) => [r.id, r]));
  let cur = map.get(folderId) ?? null;
  if (!cur) return { canView: false, canUpload: false, canApprove: false, canManage: false };

  for (let i = 0; i < 10; i++) {
    if (!cur.parentId) break;
    const parent = map.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  const rootFolder = cur;

  const matrixRows = allMatrixRows.filter((r) => r.folderId === rootFolder.id);
  if (matrixRows.length > 0) {
    return computeFromMatrix(matrixRows, level, roleSlugs, maxDegree);
  }
  if (rootFolder.isSystemRoot) {
    return { canView: false, canUpload: false, canApprove: false, canManage: false };
  }
  return computeFromLegacy(rootFolder, level, roleSlugs, maxDegree);
}

// ── Matrix CRUD ───────────────────────────────────────────────────────────────

/**
 * Fetches all matrix rows for the root folder linked to the given domain ID.
 * Returns null if the domain has no linked system root folder.
 */
export async function getMatrixForDomain(
  domainId: string,
  lodgeId: string,
): Promise<{ folderId: string; rows: typeof folderAccessMatrixTable.$inferSelect[] } | null> {
  const folder = await db
    .select({ id: documentFoldersTable.id })
    .from(documentFoldersTable)
    .where(
      and(
        eq(documentFoldersTable.domainId, domainId),
        eq(documentFoldersTable.lodgeId, lodgeId),
        eq(documentFoldersTable.isSystemRoot, true),
      ),
    )
    .then((r) => r[0] ?? null);

  if (!folder) return null;

  const rows = await db
    .select()
    .from(folderAccessMatrixTable)
    .where(
      and(
        eq(folderAccessMatrixTable.folderId, folder.id),
        eq(folderAccessMatrixTable.lodgeId, lodgeId),
      ),
    )
    .orderBy(folderAccessMatrixTable.permission, folderAccessMatrixTable.subjectType, folderAccessMatrixTable.subjectKey);

  return { folderId: folder.id, rows };
}

/**
 * Full-replace: deletes all existing matrix rows for the folder and inserts
 * the provided entries. Returns the new rows.
 */
export async function replaceMatrixForFolder(
  folderId: string,
  lodgeId: string,
  entries: MatrixEntryDef[],
): Promise<typeof folderAccessMatrixTable.$inferSelect[]> {
  await db
    .delete(folderAccessMatrixTable)
    .where(
      and(
        eq(folderAccessMatrixTable.folderId, folderId),
        eq(folderAccessMatrixTable.lodgeId, lodgeId),
      ),
    );

  if (entries.length === 0) return [];

  const rows = await db
    .insert(folderAccessMatrixTable)
    .values(
      entries.map((e) => ({
        lodgeId,
        folderId,
        subjectType: e.subjectType,
        subjectKey: e.subjectKey,
        permission: e.permission,
      })),
    )
    .onConflictDoNothing()
    .returning();

  return rows;
}
