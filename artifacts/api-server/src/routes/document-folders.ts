import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentFoldersTable,
  protectedDomainsTable,
  usersTable,
} from "@workspace/db/schema";
import type { FolderAccessPolicy, DomainAccessLogic } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, asc, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import { getUserVisibilityContext } from "../lib/visibility";

const router = Router();

const MEMBER_LEVEL = 20;
const SITE_ADMIN_LEVEL = 80;
const PM_SUPER_LEVEL = 90;

// ── Default domain definitions (seeded once per lodge) ────────────────────────

interface DomainDef {
  name: string;
  slug: string;
  description: string;
  accessLogic: DomainAccessLogic;
  allowedRoleSlugs: string[];
  minDegree: number | null;
  folderTitle: string;
  frame: "general" | "ritual";
}

const ALL_MEMBER_ROLES = [
  "member",
  "secretary",
  "treasurer",
  "junior-warden",
  "senior-warden",
  "worshipful-master",
  "past-master",
  "site-administrator",
  "pm-super-administrator",
];

const DEFAULT_DOMAIN_DEFS: DomainDef[] = [
  {
    name: "General Documents",
    slug: "general-documents",
    description: "Accessible to all lodge members.",
    accessLogic: "role_only",
    allowedRoleSlugs: ALL_MEMBER_ROLES,
    minDegree: null,
    folderTitle: "General Documents",
    frame: "general",
  },
  {
    name: "Meeting Minutes",
    slug: "meeting-minutes",
    description: "Official approved minutes of Lodge meetings.",
    accessLogic: "role_only",
    allowedRoleSlugs: ALL_MEMBER_ROLES,
    minDegree: null,
    folderTitle: "Meeting Minutes",
    frame: "general",
  },
  {
    name: "Secretary Documents",
    slug: "secretary-documents",
    description: "Documents for the Lodge Secretary and senior officers.",
    accessLogic: "role_only",
    allowedRoleSlugs: ["secretary", "worshipful-master", "pm-super-administrator"],
    minDegree: null,
    folderTitle: "Secretary Documents",
    frame: "general",
  },
  {
    name: "Treasury Documents",
    slug: "treasury-documents",
    description: "Financial records and treasury documents.",
    accessLogic: "role_only",
    allowedRoleSlugs: ["treasurer", "worshipful-master", "pm-super-administrator"],
    minDegree: null,
    folderTitle: "Treasury Documents",
    frame: "general",
  },
  {
    name: "Worshipful Master Documents",
    slug: "wm-documents",
    description: "Documents for the Worshipful Master.",
    accessLogic: "role_only",
    allowedRoleSlugs: ["worshipful-master", "pm-super-administrator"],
    minDegree: null,
    folderTitle: "Worshipful Master Documents",
    frame: "general",
  },
  {
    name: "Entered Apprentice Ritual",
    slug: "ea-ritual",
    description: "Ritual documents for the Entered Apprentice degree.",
    accessLogic: "role_or_degree",
    allowedRoleSlugs: ["past-master", "worshipful-master", "pm-super-administrator"],
    minDegree: 1,
    folderTitle: "Entered Apprentice Ritual",
    frame: "ritual",
  },
  {
    name: "Fellowcraft Ritual",
    slug: "fc-ritual",
    description: "Ritual documents for the Fellowcraft degree.",
    accessLogic: "role_or_degree",
    allowedRoleSlugs: ["past-master", "worshipful-master", "pm-super-administrator"],
    minDegree: 2,
    folderTitle: "Fellowcraft Ritual",
    frame: "ritual",
  },
  {
    name: "Master Mason Ritual",
    slug: "mm-ritual",
    description: "Ritual documents for the Master Mason degree.",
    accessLogic: "role_or_degree",
    allowedRoleSlugs: ["past-master", "worshipful-master", "pm-super-administrator"],
    minDegree: 3,
    folderTitle: "Master Mason Ritual",
    frame: "ritual",
  },
  {
    name: "Past Master Ritual",
    slug: "pm-ritual",
    description: "Ritual documents for Past Masters.",
    accessLogic: "role_only",
    allowedRoleSlugs: ["past-master", "worshipful-master", "pm-super-administrator"],
    minDegree: null,
    folderTitle: "Past Master Ritual",
    frame: "ritual",
  },
];

// ── Access helpers ─────────────────────────────────────────────────────────────

/**
 * Domain-based access check.
 * "member" in allowedRoleSlugs = any user at MEMBER_LEVEL or above.
 */
function canAccessDomain(
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

/** Legacy accessPolicy JSONB fallback. */
function canAccess(
  policy: FolderAccessPolicy,
  userLevel: number,
  userSlugs: string[],
  maxDegree: number,
): boolean {
  if (policy.type === "member") return userLevel >= MEMBER_LEVEL;
  if (policy.type === "roles") return policy.slugs.some((s) => userSlugs.includes(s));
  if (policy.type === "degree") {
    const degreeAccess = maxDegree >= policy.minDegree;
    const roleAccess =
      userSlugs.includes("past-master") || userSlugs.includes("worshipful-master");
    return degreeAccess || roleAccess;
  }
  return false;
}

function checkFolderAccess(
  folder: {
    accessPolicy: unknown;
    domainId: string | null;
    domainAccessLogic: DomainAccessLogic | null;
    domainAllowedRoleSlugs: string[] | null;
    domainMinDegree: number | null;
  },
  userLevel: number,
  userSlugs: string[],
  maxDegree: number,
): boolean {
  if (folder.domainId && folder.domainAccessLogic) {
    return canAccessDomain(
      folder.domainAccessLogic,
      folder.domainAllowedRoleSlugs ?? [],
      folder.domainMinDegree ?? null,
      userLevel,
      userSlugs,
      maxDegree,
    );
  }
  if (!folder.accessPolicy) return false;
  return canAccess(folder.accessPolicy as FolderAccessPolicy, userLevel, userSlugs, maxDegree);
}

// ── Seeding ────────────────────────────────────────────────────────────────────

async function seedDefaultFolders(lodgeId: string, userId: string): Promise<void> {
  for (const def of DEFAULT_DOMAIN_DEFS) {
    const [domain] = await db
      .insert(protectedDomainsTable)
      .values({
        lodgeId,
        name: def.name,
        slug: def.slug,
        description: def.description,
        accessLogic: def.accessLogic,
        allowedRoleSlugs: def.allowedRoleSlugs,
        minDegree: def.minDegree,
        createdBy: userId,
      })
      .onConflictDoNothing()
      .returning();

    const domainId = domain?.id ?? (
      await db
        .select({ id: protectedDomainsTable.id })
        .from(protectedDomainsTable)
        .where(
          and(
            eq(protectedDomainsTable.lodgeId, lodgeId),
            eq(protectedDomainsTable.slug, def.slug),
          ),
        )
        .then((r) => r[0]?.id)
    );

    if (domainId) {
      await db.insert(documentFoldersTable).values({
        lodgeId,
        parentId: null,
        title: def.folderTitle,
        description: def.description,
        domainId,
        frame: def.frame,
        isSystemRoot: true,
        sortOrder: DEFAULT_DOMAIN_DEFS.indexOf(def) + 1,
        createdBy: userId,
      });
    }
  }
}

/**
 * Auto-migration: if root folders exist but have no domainId, create domains
 * and link matching folders. Runs once per lodge per deployment.
 */
async function seedAndLinkDomains(lodgeId: string, userId: string): Promise<void> {
  for (const def of DEFAULT_DOMAIN_DEFS) {
    let domainId: string | undefined;

    const existing = await db
      .select({ id: protectedDomainsTable.id })
      .from(protectedDomainsTable)
      .where(
        and(
          eq(protectedDomainsTable.lodgeId, lodgeId),
          eq(protectedDomainsTable.slug, def.slug),
        ),
      )
      .then((r) => r[0]);

    if (existing) {
      domainId = existing.id;
      // Sync access rules to spec defaults
      await db
        .update(protectedDomainsTable)
        .set({
          accessLogic: def.accessLogic,
          allowedRoleSlugs: def.allowedRoleSlugs,
          minDegree: def.minDegree,
          updatedAt: new Date(),
        })
        .where(eq(protectedDomainsTable.id, existing.id));
    } else {
      const [created] = await db
        .insert(protectedDomainsTable)
        .values({
          lodgeId,
          name: def.name,
          slug: def.slug,
          description: def.description,
          accessLogic: def.accessLogic,
          allowedRoleSlugs: def.allowedRoleSlugs,
          minDegree: def.minDegree,
          createdBy: userId,
        })
        .returning();
      domainId = created?.id;
    }

    if (domainId) {
      await db
        .update(documentFoldersTable)
        .set({ domainId, frame: def.frame, updatedAt: new Date() })
        .where(
          and(
            eq(documentFoldersTable.lodgeId, lodgeId),
            eq(documentFoldersTable.title, def.folderTitle),
            isNull(documentFoldersTable.domainId),
          ),
        );
    }
  }
}

// ── Query helper ───────────────────────────────────────────────────────────────

type FolderRow = {
  id: string;
  title: string;
  description: string | null;
  accessPolicy: unknown;
  domainId: string | null;
  frame: string;
  isSystemRoot: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  domainAccessLogic: DomainAccessLogic | null;
  domainAllowedRoleSlugs: string[] | null;
  domainMinDegree: number | null;
};

const folderColumns = {
  id: documentFoldersTable.id,
  title: documentFoldersTable.title,
  description: documentFoldersTable.description,
  accessPolicy: documentFoldersTable.accessPolicy,
  domainId: documentFoldersTable.domainId,
  frame: documentFoldersTable.frame,
  isSystemRoot: documentFoldersTable.isSystemRoot,
  sortOrder: documentFoldersTable.sortOrder,
  createdAt: documentFoldersTable.createdAt,
  updatedAt: documentFoldersTable.updatedAt,
  domainAccessLogic: protectedDomainsTable.accessLogic,
  domainAllowedRoleSlugs: protectedDomainsTable.allowedRoleSlugs,
  domainMinDegree: protectedDomainsTable.minDegree,
};

function formatFolder(f: FolderRow, subfolderCount: number) {
  return {
    id: f.id,
    title: f.title,
    description: f.description ?? null,
    isSystemRoot: f.isSystemRoot,
    sortOrder: f.sortOrder,
    frame: f.frame,
    domainId: f.domainId ?? null,
    subfolderCount,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// ── Schema ─────────────────────────────────────────────────────────────────────

const subfolderCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
});

const folderUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

const folderDomainLinkSchema = z.object({
  domainId: z.string().nullable(),
  frame: z.enum(["general", "ritual"]).optional(),
});

// ── GET /document-folders ──────────────────────────────────────────────────────
router.get("/", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const { maxPermLevel: level, roleSlugs: slugs, maxDegree } = await getUserVisibilityContext(userId);

  // Seed if no root folders exist
  const rootCount = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), isNull(documentFoldersTable.parentId)));

  if ((rootCount[0]?.c ?? 0) === 0) {
    await seedDefaultFolders(lodgeId, userId);
  } else {
    // Auto-migrate: link existing folders to domains if not yet done
    const unlinkedCount = await db
      .select({ c: count() })
      .from(documentFoldersTable)
      .where(
        and(
          eq(documentFoldersTable.lodgeId, lodgeId),
          isNull(documentFoldersTable.parentId),
          isNull(documentFoldersTable.domainId),
        ),
      );
    if ((unlinkedCount[0]?.c ?? 0) > 0) {
      await seedAndLinkDomains(lodgeId, userId);
    }
  }

  // Get root folders with their domain rules in one JOIN
  const rootFolders = await db
    .select(folderColumns)
    .from(documentFoldersTable)
    .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), isNull(documentFoldersTable.parentId)))
    .orderBy(asc(documentFoldersTable.sortOrder), asc(documentFoldersTable.title));

  const accessible = rootFolders.filter((f) =>
    checkFolderAccess(f as FolderRow, level, slugs, maxDegree),
  );

  if (accessible.length === 0) {
    res.json({ folders: [] });
    return;
  }

  // Subfolder counts — all at once, filter in code
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
    folders: accessible.map((f) => formatFolder(f as FolderRow, countMap.get(f.id) ?? 0)),
  });
});

// ── GET /document-folders/:id ──────────────────────────────────────────────────
router.get("/:id", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const { maxPermLevel: level, roleSlugs: slugs, maxDegree } = await getUserVisibilityContext(userId);

  const folder = await db
    .select(folderColumns)
    .from(documentFoldersTable)
    .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
    .where(
      and(
        eq(documentFoldersTable.id, String(req.params.id)),
        eq(documentFoldersTable.lodgeId, lodgeId),
      ),
    )
    .then((rows) => (rows[0] ?? null) as FolderRow | null);

  if (!folder) { res.status(404).json({ error: "Not found" }); return; }

  // For subfolders: walk up to root to find effective domain
  let effectiveFolder: FolderRow = folder;
  if (!folder.domainId && folder.accessPolicy === null) {
    // Find the root ancestor
    const allFolderRows = await db
      .select(folderColumns)
      .from(documentFoldersTable)
      .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
      .where(eq(documentFoldersTable.lodgeId, lodgeId));

    const rootFolder = findRootAncestor(folder, allFolderRows as FolderRow[]);
    if (rootFolder) effectiveFolder = rootFolder;
  }

  if (!checkFolderAccess(effectiveFolder, level, slugs, maxDegree)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  // Get subfolders
  const subfolders = await db
    .select(folderColumns)
    .from(documentFoldersTable)
    .leftJoin(protectedDomainsTable, eq(documentFoldersTable.domainId, protectedDomainsTable.id))
    .where(
      and(
        eq(documentFoldersTable.lodgeId, lodgeId),
        sql`${documentFoldersTable.parentId} = ${folder.id}`,
      ),
    )
    .orderBy(asc(documentFoldersTable.sortOrder), asc(documentFoldersTable.title));

  // Sub-subfolder counts
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
    frame: folder.frame,
    domainId: folder.domainId ?? null,
    subfolders: subfolders.map((s) => formatFolder(s as FolderRow, subCountMap.get(s.id) ?? 0)),
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  });
});

function findRootAncestor(folder: FolderRow, all: FolderRow[]): FolderRow | null {
  // Walk up parent chain until we find a folder with a domain or accessPolicy
  const map = new Map(all.map((f) => [f.id, f]));
  let cur: FolderRow = folder;
  for (let i = 0; i < 10; i++) {
    if (cur.domainId || cur.accessPolicy) return cur;
    const parentId = (cur as any).parentId;
    if (!parentId) return cur;
    const parent = map.get(parentId);
    if (!parent) return cur;
    cur = parent;
  }
  return cur;
}

// ── POST /document-folders/:id/subfolders ─────────────────────────────────────
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

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const existingCount = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), sql`${documentFoldersTable.parentId} = ${parent.id}`));
  const sortOrder = Number(existingCount[0]?.c ?? 0);

  const [newFolder] = await db
    .insert(documentFoldersTable)
    .values({
      lodgeId,
      parentId: parent.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      frame: parent.frame,
      isSystemRoot: false,
      sortOrder,
      createdBy: userId,
    })
    .returning();

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

  res.status(201).json(
    formatFolder(
      {
        ...newFolder,
        domainAccessLogic: null,
        domainAllowedRoleSlugs: null,
        domainMinDegree: null,
      },
      0,
    ),
  );
});

// ── PATCH /document-folders/:id ───────────────────────────────────────────────
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

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
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
  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: isSubfolder ? "SUBFOLDER_RENAMED" : "FOLDER_RENAMED",
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

  const subfolderCountRows = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), sql`${documentFoldersTable.parentId} = ${folder.id}`));

  res.json(
    formatFolder(
      {
        ...updated,
        domainAccessLogic: null,
        domainAllowedRoleSlugs: null,
        domainMinDegree: null,
      },
      Number(subfolderCountRows[0]?.c ?? 0),
    ),
  );
});

// ── PATCH /document-folders/:id/domain ────────────────────────────────────────
router.patch("/:id/domain", requireAuth(), requireRole(PM_SUPER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = folderDomainLinkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const folder = await db
    .select()
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.id, String(req.params.id)), eq(documentFoldersTable.lodgeId, lodgeId)))
    .then((rows) => rows[0] ?? null);

  if (!folder) { res.status(404).json({ error: "Not found" }); return; }

  let domainName: string | null = null;
  if (parsed.data.domainId) {
    const domain = await db
      .select({ id: protectedDomainsTable.id, name: protectedDomainsTable.name })
      .from(protectedDomainsTable)
      .where(and(eq(protectedDomainsTable.id, parsed.data.domainId), eq(protectedDomainsTable.lodgeId, lodgeId!)))
      .then((r) => r[0] ?? null);
    if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }
    domainName = domain.name;
  }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const updates: Partial<typeof documentFoldersTable.$inferInsert> = {
    domainId: parsed.data.domainId ?? null,
    updatedAt: new Date(),
  };
  if (parsed.data.frame) updates.frame = parsed.data.frame;

  await db.update(documentFoldersTable).set(updates).where(eq(documentFoldersTable.id, folder.id));

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "FOLDER_DOMAIN_LINKED",
    targetType: "folder",
    targetId: folder.id,
    detail: {
      folderTitle: folder.title,
      domainId: parsed.data.domainId,
      domainName,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ success: true });
});

// ── DELETE /document-folders/:id ──────────────────────────────────────────────
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

  const childCount = await db
    .select({ c: count() })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.lodgeId, lodgeId), sql`${documentFoldersTable.parentId} = ${folder.id}`));
  if (Number(childCount[0]?.c ?? 0) > 0) {
    res.status(400).json({ error: "Cannot delete a folder that contains subfolders" });
    return;
  }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  await db.delete(documentFoldersTable).where(eq(documentFoldersTable.id, folder.id));

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "SUBFOLDER_DELETED",
    targetType: "folder",
    targetId: folder.id,
    detail: { folderTitle: folder.title, actorName },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ success: true });
});

export default router;
