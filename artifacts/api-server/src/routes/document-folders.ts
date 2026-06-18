import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { documentFoldersTable, userRolesTable, rolesTable, usersTable } from "@workspace/db/schema";
import type { FolderAccessPolicy } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, asc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const router = Router();

const MEMBER_LEVEL = 20;
const SITE_ADMIN_LEVEL = 80;
const PM_SUPER_LEVEL = 90;

const DEFAULT_ROOT_FOLDERS: {
  title: string;
  description: string;
  accessPolicy: FolderAccessPolicy;
  sortOrder: number;
}[] = [
  {
    title: "General Documents",
    description: "General documents for all lodge members.",
    accessPolicy: { type: "member" },
    sortOrder: 1,
  },
  {
    title: "Meeting Minutes",
    description: "Official approved minutes of Lodge meetings.",
    accessPolicy: { type: "member" },
    sortOrder: 2,
  },
  {
    title: "Secretary Documents",
    description: "Documents for the Lodge Secretary and senior officers.",
    accessPolicy: { type: "roles", slugs: ["worshipful-master", "secretary", "pm-super-administrator"] },
    sortOrder: 3,
  },
  {
    title: "Treasury Documents",
    description: "Financial records and treasury documents.",
    accessPolicy: { type: "roles", slugs: ["worshipful-master", "treasurer", "pm-super-administrator"] },
    sortOrder: 4,
  },
  {
    title: "Worshipful Master Documents",
    description: "Documents for the Worshipful Master.",
    accessPolicy: { type: "roles", slugs: ["worshipful-master", "pm-super-administrator"] },
    sortOrder: 5,
  },
  {
    title: "Entered Apprentice Ritual",
    description: "Ritual documents for the Entered Apprentice degree.",
    accessPolicy: { type: "roles", slugs: ["entered-apprentice", "fellowcraft", "master-mason", "past-master", "worshipful-master", "site-administrator", "pm-super-administrator"] },
    sortOrder: 6,
  },
  {
    title: "Fellowcraft Ritual",
    description: "Ritual documents for the Fellowcraft degree.",
    accessPolicy: { type: "roles", slugs: ["fellowcraft", "master-mason", "past-master", "worshipful-master", "site-administrator", "pm-super-administrator"] },
    sortOrder: 7,
  },
  {
    title: "Master Mason Ritual",
    description: "Ritual documents for the Master Mason degree.",
    accessPolicy: { type: "roles", slugs: ["master-mason", "past-master", "worshipful-master", "site-administrator", "pm-super-administrator"] },
    sortOrder: 8,
  },
  {
    title: "Past Master Ritual",
    description: "Ritual documents for Past Masters.",
    accessPolicy: { type: "roles", slugs: ["past-master", "worshipful-master", "pm-super-administrator"] },
    sortOrder: 9,
  },
];

function canAccess(
  policy: FolderAccessPolicy,
  userLevel: number,
  userSlugs: string[],
): boolean {
  if (policy.type === "member") return userLevel >= MEMBER_LEVEL;
  if (policy.type === "roles") return policy.slugs.some((s) => userSlugs.includes(s));
  return false;
}

async function getUserRoleInfo(userId: string): Promise<{ level: number; slugs: string[] }> {
  const rows = await db
    .select({ permissionLevel: rolesTable.permissionLevel, slug: rolesTable.slug })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, userId));
  return {
    level: rows.reduce((max, r) => Math.max(max, r.permissionLevel), 0),
    slugs: rows.map((r) => r.slug),
  };
}

async function seedDefaultFolders(lodgeId: string, userId: string): Promise<void> {
  await db.insert(documentFoldersTable).values(
    DEFAULT_ROOT_FOLDERS.map((f) => ({
      lodgeId,
      parentId: null,
      title: f.title,
      description: f.description,
      accessPolicy: f.accessPolicy as FolderAccessPolicy,
      isSystemRoot: true,
      sortOrder: f.sortOrder,
      createdBy: userId,
    }))
  );
}

async function getRootPolicy(
  folder: typeof documentFoldersTable.$inferSelect,
  allFolders: typeof documentFoldersTable.$inferSelect[],
): Promise<FolderAccessPolicy | null> {
  if (folder.accessPolicy) return folder.accessPolicy as FolderAccessPolicy;
  if (!folder.parentId) return null;
  const parent = allFolders.find((f) => f.id === folder.parentId);
  if (!parent) return null;
  return getRootPolicy(parent, allFolders);
}

function formatFolder(
  f: typeof documentFoldersTable.$inferSelect,
  subfolderCount: number,
) {
  return {
    id: f.id,
    title: f.title,
    description: f.description ?? null,
    isSystemRoot: f.isSystemRoot,
    sortOrder: f.sortOrder,
    subfolderCount,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

const subfolderCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
});

const folderUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

// ── GET /document-folders ────────────────────────────────────────────────────
router.get("/", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const { level, slugs } = await getUserRoleInfo(userId);

  // Seed default folders if none exist
  const rootCount = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), isNull(documentFoldersTable.parentId)));
  if ((rootCount[0]?.c ?? 0) === 0) {
    await seedDefaultFolders(lodgeId, userId);
  }

  // Get all root folders
  const rootFolders = await db
    .select()
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), isNull(documentFoldersTable.parentId)))
    .orderBy(asc(documentFoldersTable.sortOrder), asc(documentFoldersTable.title));

  // Filter to accessible ones
  const accessible = rootFolders.filter((f) => {
    if (!f.accessPolicy) return false;
    return canAccess(f.accessPolicy as FolderAccessPolicy, level, slugs);
  });

  if (accessible.length === 0) {
    res.json({ folders: [] });
    return;
  }

  // Get subfolder counts — broader query, filter in code (avoids nullable-column inArray TS issue)
  const accessibleIds = new Set(accessible.map((f) => f.id));
  const allSubfolderRows = await db
    .select({ parentId: documentFoldersTable.parentId })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), isNotNull(documentFoldersTable.parentId)));

  const countMap = new Map<string, number>();
  for (const row of allSubfolderRows) {
    if (row.parentId && accessibleIds.has(row.parentId)) {
      countMap.set(row.parentId, (countMap.get(row.parentId) ?? 0) + 1);
    }
  }

  res.json({
    folders: accessible.map((f) => formatFolder(f, countMap.get(f.id) ?? 0)),
  });
});

// ── GET /document-folders/:id ────────────────────────────────────────────────
router.get("/:id", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const { level, slugs } = await getUserRoleInfo(userId);

  // Fetch the folder + all its siblings/parents to resolve inherited policy
  const folder = await db
    .select()
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.id, String(req.params.id)), eq(documentFoldersTable.lodgeId, lodgeId)))
    .then((rows) => rows[0] ?? null);

  if (!folder) { res.status(404).json({ error: "Not found" }); return; }

  // Determine effective access policy
  let effectivePolicy = folder.accessPolicy as FolderAccessPolicy | null;
  if (!effectivePolicy && folder.parentId) {
    // Walk up to find root policy
    const allFolders = await db
      .select()
      .from(documentFoldersTable)
      .where(eq(documentFoldersTable.lodgeId, lodgeId));
    effectivePolicy = await getRootPolicy(folder, allFolders);
  }

  if (!effectivePolicy || !canAccess(effectivePolicy, level, slugs)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Get subfolders (use sql template to avoid nullable-column eq TS issue)
  const subfolders = await db
    .select()
    .from(documentFoldersTable)
    .where(and(
      eq(documentFoldersTable.lodgeId, lodgeId),
      sql`${documentFoldersTable.parentId} = ${folder.id}`,
    ))
    .orderBy(asc(documentFoldersTable.sortOrder), asc(documentFoldersTable.title));

  // Get sub-subfolder counts — code-level filter to avoid nullable inArray TS issue
  const subIdSet = new Set(subfolders.map((s) => s.id));
  const subCountMap = new Map<string, number>();
  if (subIdSet.size > 0) {
    const grandchildren = await db
      .select({ parentId: documentFoldersTable.parentId })
      .from(documentFoldersTable)
      .where(and(eq(documentFoldersTable.lodgeId, lodgeId), isNotNull(documentFoldersTable.parentId)));
    for (const g of grandchildren) {
      if (g.parentId && subIdSet.has(g.parentId)) {
        subCountMap.set(g.parentId, (subCountMap.get(g.parentId) ?? 0) + 1);
      }
    }
  }

  res.json({
    id: folder.id,
    title: folder.title,
    description: folder.description ?? null,
    isSystemRoot: folder.isSystemRoot,
    sortOrder: folder.sortOrder,
    subfolders: subfolders.map((s) => formatFolder(s, subCountMap.get(s.id) ?? 0)),
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  });
});

// ── POST /document-folders/:id/subfolders ────────────────────────────────────
router.post("/:id/subfolders", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = subfolderCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const parent = await db
    .select()
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.id, String(req.params.id)), eq(documentFoldersTable.lodgeId, lodgeId)))
    .then((rows) => rows[0] ?? null);

  if (!parent) { res.status(404).json({ error: "Parent folder not found" }); return; }

  // Get actor name for audit log
  const actor = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  // Count existing subfolders for sortOrder
  const existingCount = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), sql`${documentFoldersTable.parentId} = ${parent.id}`));
  const sortOrder = Number(existingCount[0]?.c ?? 0);

  const [newFolder] = await db.insert(documentFoldersTable).values({
    lodgeId,
    parentId: parent.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    accessPolicy: null,
    isSystemRoot: false,
    sortOrder,
    createdBy: userId,
  }).returning();

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "SUBFOLDER_CREATED",
    targetType: "folder",
    targetId: newFolder.id,
    detail: {
      folderTitle: parsed.data.title,
      parentFolderTitle: parent.title,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.status(201).json(formatFolder(newFolder, 0));
});

// ── PATCH /document-folders/:id ──────────────────────────────────────────────
router.patch("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = folderUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const folder = await db
    .select()
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.id, String(req.params.id)), eq(documentFoldersTable.lodgeId, lodgeId)))
    .then((rows) => rows[0] ?? null);

  if (!folder) { res.status(404).json({ error: "Not found" }); return; }

  const actor = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const updates: Partial<typeof documentFoldersTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  const [updated] = await db
    .update(documentFoldersTable)
    .set(updates)
    .where(eq(documentFoldersTable.id, folder.id))
    .returning();

  const isSubfolder = !!folder.parentId;
  const auditAction = isSubfolder ? "SUBFOLDER_RENAMED" : "FOLDER_RENAMED";

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: auditAction,
    targetType: "folder",
    targetId: folder.id,
    detail: {
      oldTitle: folder.title,
      newTitle: parsed.data.title ?? folder.title,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  // Return with subfolder count
  const subfolderCountRows = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), sql`${documentFoldersTable.parentId} = ${folder.id}`));
  const subfolderCount = Number(subfolderCountRows[0]?.c ?? 0);

  res.json({
    id: updated.id,
    title: updated.title,
    description: updated.description ?? null,
    isSystemRoot: updated.isSystemRoot,
    sortOrder: updated.sortOrder,
    subfolders: [],
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    subfolderCount,
  });
});

// ── DELETE /document-folders/:id ─────────────────────────────────────────────
router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const folder = await db
    .select()
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.id, String(req.params.id)), eq(documentFoldersTable.lodgeId, lodgeId)))
    .then((rows) => rows[0] ?? null);

  if (!folder) { res.status(404).json({ error: "Not found" }); return; }
  if (folder.isSystemRoot) { res.status(400).json({ error: "Cannot delete a system root folder" }); return; }

  // Check empty
  const childCount = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), sql`${documentFoldersTable.parentId} = ${folder.id}`));
  if (Number(childCount[0]?.c ?? 0) > 0) {
    res.status(400).json({ error: "Cannot delete a folder that contains subfolders" });
    return;
  }

  const actor = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  await db.delete(documentFoldersTable).where(eq(documentFoldersTable.id, folder.id));

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "SUBFOLDER_DELETED",
    targetType: "folder",
    targetId: folder.id,
    detail: {
      folderTitle: folder.title,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ success: true });
});

export default router;
