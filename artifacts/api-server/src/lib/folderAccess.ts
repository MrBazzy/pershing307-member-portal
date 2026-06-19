import { db } from "@workspace/db";
import { documentFoldersTable, protectedDomainsTable } from "@workspace/db/schema";
import type { FolderAccessPolicy, DomainAccessLogic } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

const MEMBER_LEVEL = 20;

export type FolderAccessRow = {
  id: string;
  title: string;
  frame: string;
  lodgeId: string;
  parentId: string | null;
  isSystemRoot: boolean;
  accessPolicy: unknown;
  domainId: string | null;
  domainSlug: string | null;
  domainAccessLogic: DomainAccessLogic | null;
  domainAllowedRoleSlugs: string[] | null;
  domainMinDegree: number | null;
};

export const folderAccessColumns = {
  id: documentFoldersTable.id,
  title: documentFoldersTable.title,
  frame: documentFoldersTable.frame,
  lodgeId: documentFoldersTable.lodgeId,
  parentId: documentFoldersTable.parentId,
  isSystemRoot: documentFoldersTable.isSystemRoot,
  accessPolicy: documentFoldersTable.accessPolicy,
  domainId: documentFoldersTable.domainId,
  domainSlug: protectedDomainsTable.slug,
  domainAccessLogic: protectedDomainsTable.accessLogic,
  domainAllowedRoleSlugs: protectedDomainsTable.allowedRoleSlugs,
  domainMinDegree: protectedDomainsTable.minDegree,
};

export function canAccessDomain(
  accessLogic: DomainAccessLogic,
  allowedRoleSlugs: string[],
  minDegree: number | null,
  userLevel: number,
  userSlugs: string[],
  maxDegree: number,
): boolean {
  let roleMatch: boolean;
  if (allowedRoleSlugs.includes("member")) {
    roleMatch = userLevel >= MEMBER_LEVEL;
  } else {
    roleMatch = allowedRoleSlugs.some((s) => userSlugs.includes(s));
  }
  const degreeMatch = minDegree != null ? maxDegree >= minDegree : false;
  switch (accessLogic) {
    case "role_only": return roleMatch;
    case "degree_only": return degreeMatch;
    case "role_or_degree": return roleMatch || degreeMatch;
    case "role_and_degree": return roleMatch && degreeMatch;
    default: return false;
  }
}

function canAccessLegacy(
  policy: FolderAccessPolicy,
  userLevel: number,
  userSlugs: string[],
  maxDegree: number,
): boolean {
  if (policy.type === "member") return userLevel >= MEMBER_LEVEL;
  if (policy.type === "roles") return policy.slugs.some((s) => userSlugs.includes(s));
  if (policy.type === "degree") {
    return maxDegree >= policy.minDegree || userSlugs.includes("past-master") || userSlugs.includes("worshipful-master");
  }
  return false;
}

export function checkFolderAccess(
  folder: FolderAccessRow,
  userLevel: number,
  userSlugs: string[],
  maxDegree: number,
): boolean {
  if (folder.domainId && folder.domainAccessLogic) {
    return canAccessDomain(
      folder.domainAccessLogic,
      folder.domainAllowedRoleSlugs ?? [],
      folder.domainMinDegree ?? null,
      userLevel, userSlugs, maxDegree,
    );
  }
  if (!folder.accessPolicy) return false;
  return canAccessLegacy(folder.accessPolicy as FolderAccessPolicy, userLevel, userSlugs, maxDegree);
}

/**
 * Determines if the user can upload to a folder.
 * Admins (≥ 80) can upload to any folder.
 * Members (≥ 20) can only upload to the "General Documents" domain
 * (domainSlug === "general-documents") or its subfolders.
 */
export function canUploadToFolder(
  folder: FolderAccessRow,
  userLevel: number,
): boolean {
  if (userLevel >= 80) return true;
  if (userLevel >= MEMBER_LEVEL && folder.domainSlug === "general-documents") return true;
  return false;
}

/**
 * Returns the initial status when a user uploads to a folder.
 * Admins get "published", members get "pending_review".
 */
export function initialDocumentStatus(userLevel: number): "published" | "pending_review" {
  return userLevel >= 80 ? "published" : "pending_review";
}

/**
 * Fetch a folder with its domain access info, walking up to find the
 * effective access folder if the given folder has no domain/policy.
 */
export async function getFolderWithAccess(
  folderId: string,
  lodgeId: string,
): Promise<FolderAccessRow | null> {
  const rows = await db
    .select(folderAccessColumns)
    .from(documentFoldersTable)
    .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
    .where(eq(documentFoldersTable.lodgeId, lodgeId));

  const map = new Map(rows.map((r) => [r.id, r as FolderAccessRow]));
  const target = map.get(folderId) ?? null;
  if (!target) return null;

  // Walk up ancestry to find effective access rules
  if (!target.domainId && !target.accessPolicy) {
    let cur: FolderAccessRow = target;
    for (let i = 0; i < 10; i++) {
      if (cur.domainId || cur.accessPolicy) return cur;
      const parent = cur.parentId ? (map.get(cur.parentId) ?? null) : null;
      if (!parent) return cur;
      cur = parent;
    }
    return cur;
  }
  return target;
}
