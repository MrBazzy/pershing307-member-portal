import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { protectedDomainsTable, usersTable, userDomainAccessTable, documentFoldersTable, userRolesTable, rolesTable } from "@workspace/db/schema";
import type { DomainAccessLogic, DomainFrame, DomainProtectionLevel } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import {
  getMatrixForDomain,
  replaceMatrixForFolder,
} from "../lib/matrixPermissions";
import type { MatrixEntryDef } from "../lib/matrixPermissions";

const router = Router();

const SITE_ADMIN_LEVEL = 80;
const PM_SUPER_LEVEL = 90;

const ACCESS_LOGIC_VALUES = ["role_only", "degree_only", "role_or_degree", "role_and_degree"] as const;
const FRAME_VALUES = ["general", "ritual"] as const;
const PROTECTION_LEVEL_VALUES = ["standard", "past_master_protected"] as const;

const createDomainSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  frame: z.enum(FRAME_VALUES).optional().default("general"),
  description: z.string().max(1000).nullable().optional(),
  domainProtectionLevel: z.enum(PROTECTION_LEVEL_VALUES).optional().default("standard"),
  accessLogic: z.enum(ACCESS_LOGIC_VALUES),
  allowedRoleSlugs: z.array(z.string()).optional().default([]),
  minDegree: z.number().int().min(1).max(3).nullable().optional(),
});

const updateDomainSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  domainProtectionLevel: z.enum(PROTECTION_LEVEL_VALUES).optional(),
});

const updateAccessSchema = z.object({
  accessLogic: z.enum(ACCESS_LOGIC_VALUES),
  allowedRoleSlugs: z.array(z.string()).optional(),
  minDegree: z.number().int().min(1).max(3).nullable().optional(),
});

async function getUserLevel(userId: string): Promise<number> {
  const rows = await db
    .select({ permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, userId));
  return rows.reduce((max, r) => Math.max(max, r.permissionLevel), 0);
}

function formatDomain(d: typeof protectedDomainsTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    frame: (d.frame ?? "general") as DomainFrame,
    description: d.description ?? null,
    domainProtectionLevel: (d.domainProtectionLevel ?? "standard") as DomainProtectionLevel,
    accessLogic: d.accessLogic as DomainAccessLogic,
    allowedRoleSlugs: (d.allowedRoleSlugs as string[]) ?? [],
    minDegree: d.minDegree ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// ── GET /document-domains ──────────────────────────────────────────────────────
router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const domains = await db
    .select()
    .from(protectedDomainsTable)
    .where(eq(protectedDomainsTable.lodgeId, lodgeId))
    .orderBy(protectedDomainsTable.name);

  res.json({ domains: domains.map(formatDomain) });
});

// ── GET /document-domains/:id ──────────────────────────────────────────────────
router.get("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const domain = await db
    .select()
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, String(req.params.id)), eq(protectedDomainsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);

  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  res.json({ domain: formatDomain(domain) });
});

// ── POST /document-domains ─────────────────────────────────────────────────────
router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = createDomainSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const { name, slug, frame, description, domainProtectionLevel, accessLogic, allowedRoleSlugs, minDegree } = parsed.data;

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  // Only PM Super Admin may create a past_master_protected domain
  if (domainProtectionLevel === "past_master_protected") {
    const userLevel = await getUserLevel(userId);
    if (userLevel < PM_SUPER_LEVEL) {
      await writeAuditLog({
        lodgeId,
        actorId: userId,
        actorEmail: actor?.email ?? "",
        action: "DOMAIN_PROTECTION_BLOCKED",
        targetType: "domain",
        targetId: null,
        detail: {
          domainName: name,
          attemptedAction: "create_past_master_protected_domain",
          actorName,
          reason: "Only a PM Super Administrator may create Past Master protected domains.",
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] ?? null,
      });
      res.status(403).json({ error: "Only a PM Super Administrator may manage Past Master protected domains." });
      return;
    }
  }

  // Check slug uniqueness
  const existing = await db
    .select({ id: protectedDomainsTable.id })
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.lodgeId, lodgeId), eq(protectedDomainsTable.slug, slug)))
    .then((r) => r[0] ?? null);
  if (existing) { res.status(409).json({ error: "A domain with this slug already exists" }); return; }

  const [created] = await db
    .insert(protectedDomainsTable)
    .values({
      lodgeId,
      name,
      slug,
      frame: frame ?? "general",
      description: description ?? null,
      domainProtectionLevel: domainProtectionLevel ?? "standard",
      accessLogic,
      allowedRoleSlugs: allowedRoleSlugs ?? [],
      minDegree: minDegree ?? null,
      createdBy: userId,
    })
    .returning();

  const isProtected = (domainProtectionLevel ?? "standard") === "past_master_protected";
  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOMAIN_CREATED",
    targetType: "domain",
    targetId: created.id,
    detail: {
      domainName: name,
      accessLogic,
      domainProtectionLevel: domainProtectionLevel ?? "standard",
      actorName,
      summary: isProtected
        ? `${actorName} created domain "${name}" and marked it as Past Master Protected.`
        : `${actorName} created domain "${name}".`,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.status(201).json({ domain: formatDomain(created) });
});

// ── PATCH /document-domains/:id ───────────────────────────────────────────────
router.patch("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = updateDomainSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const domain = await db
    .select()
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, String(req.params.id)), eq(protectedDomainsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const userLevel = await getUserLevel(userId);

  // Block Site Admin from modifying a past_master_protected domain
  if (domain.domainProtectionLevel === "past_master_protected" && userLevel < PM_SUPER_LEVEL) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOMAIN_PROTECTION_BLOCKED",
      targetType: "domain",
      targetId: domain.id,
      detail: {
        domainName: domain.name,
        attemptedAction: "edit_details",
        actorName,
        summary: `${actorName} attempted to update "${domain.name}" but was denied because the domain is Past Master Protected.`,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(403).json({ error: "Only a PM Super Administrator may manage Past Master protected domains." });
    return;
  }

  // Only PM Super Admin may change the protection level
  if (parsed.data.domainProtectionLevel !== undefined && userLevel < PM_SUPER_LEVEL) {
    res.status(403).json({ error: "Only a PM Super Administrator may change the protection level of a domain." });
    return;
  }

  const updates: Partial<typeof protectedDomainsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.domainProtectionLevel !== undefined) updates.domainProtectionLevel = parsed.data.domainProtectionLevel;

  const [updated] = await db
    .update(protectedDomainsTable)
    .set(updates)
    .where(eq(protectedDomainsTable.id, domain.id))
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOMAIN_UPDATED",
    targetType: "domain",
    targetId: domain.id,
    detail: {
      domainName: updated.name,
      changes: parsed.data,
      actorName,
      summary: `${actorName} updated domain "${updated.name}".`,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ domain: formatDomain(updated) });
});

// ── PATCH /document-domains/:id/access ────────────────────────────────────────
router.patch("/:id/access", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = updateAccessSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const domain = await db
    .select()
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, String(req.params.id)), eq(protectedDomainsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const userLevel = await getUserLevel(userId);

  if (domain.domainProtectionLevel === "past_master_protected" && userLevel < PM_SUPER_LEVEL) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOMAIN_PROTECTION_BLOCKED",
      targetType: "domain",
      targetId: domain.id,
      detail: {
        domainName: domain.name,
        attemptedAction: "edit_access_rules",
        actorName,
        summary: `${actorName} attempted to update "${domain.name}" but was denied because the domain is Past Master Protected.`,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(403).json({ error: "Only a PM Super Administrator may manage Past Master protected domains." });
    return;
  }

  const [updated] = await db
    .update(protectedDomainsTable)
    .set({
      accessLogic: parsed.data.accessLogic,
      allowedRoleSlugs: parsed.data.allowedRoleSlugs ?? domain.allowedRoleSlugs,
      minDegree: parsed.data.minDegree !== undefined ? parsed.data.minDegree : domain.minDegree,
      updatedAt: new Date(),
    })
    .where(eq(protectedDomainsTable.id, domain.id))
    .returning();

  const slugsList = (parsed.data.allowedRoleSlugs ?? (domain.allowedRoleSlugs as string[]) ?? [])
    .map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(", ");

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOMAIN_ACCESS_RULE_CHANGED",
    targetType: "domain",
    targetId: domain.id,
    detail: {
      domainName: domain.name,
      accessLogic: parsed.data.accessLogic,
      allowedRoleSlugs: parsed.data.allowedRoleSlugs,
      minDegree: parsed.data.minDegree,
      summary: `${actorName} changed domain "${domain.name}" to allow ${slugsList}.`,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ domain: formatDomain(updated) });
});

// ── GET /document-domains/:id/access-matrix ───────────────────────────────────
router.get("/:id/access-matrix", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const domain = await db
    .select()
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, String(req.params.id)), eq(protectedDomainsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  const result = await getMatrixForDomain(domain.id, lodgeId);
  if (!result) {
    res.status(404).json({ error: "No system root folder linked to this domain" });
    return;
  }

  res.json({
    domainId: domain.id,
    folderId: result.folderId,
    matrix: result.rows.map((r) => ({
      id: r.id,
      subjectType: r.subjectType,
      subjectKey: r.subjectKey,
      permission: r.permission,
    })),
  });
});

// ── PUT /document-domains/:id/access-matrix ────────────────────────────────────
const putMatrixSchema = z.object({
  matrix: z.array(
    z.object({
      subjectType: z.enum(["role", "degree"]),
      subjectKey: z.string().min(1).max(100),
      permission: z.enum(["view", "upload", "approve", "manage"]),
    }),
  ),
});

router.put("/:id/access-matrix", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = putMatrixSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const domain = await db
    .select()
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, String(req.params.id)), eq(protectedDomainsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const userLevel = await getUserLevel(userId);

  if (domain.domainProtectionLevel === "past_master_protected" && userLevel < PM_SUPER_LEVEL) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOMAIN_PROTECTION_BLOCKED",
      targetType: "domain",
      targetId: domain.id,
      detail: {
        domainName: domain.name,
        attemptedAction: "modify_access_matrix",
        actorName,
        summary: `${actorName} attempted to update access matrix for "${domain.name}" but was denied because the domain is Past Master Protected.`,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(403).json({ error: "Only a PM Super Administrator may manage Past Master protected domains." });
    return;
  }

  const existing = await getMatrixForDomain(domain.id, lodgeId);
  if (!existing) {
    res.status(404).json({ error: "No system root folder linked to this domain" });
    return;
  }

  // Diff old vs new for per-change audit entries
  const oldSet = new Set(existing.rows.map((r) => `${r.subjectType}:${r.subjectKey}:${r.permission}`));
  const newEntries: MatrixEntryDef[] = parsed.data.matrix;
  const newSet = new Set(newEntries.map((e) => `${e.subjectType}:${e.subjectKey}:${e.permission}`));

  const granted = newEntries.filter((e) => !oldSet.has(`${e.subjectType}:${e.subjectKey}:${e.permission}`));
  const revoked = existing.rows.filter((r) => !newSet.has(`${r.subjectType}:${r.subjectKey}:${r.permission}`));

  const newRows = await replaceMatrixForFolder(existing.folderId, lodgeId, newEntries);
  await db
    .update(documentFoldersTable)
    .set({ matrixInitialized: true })
    .where(eq(documentFoldersTable.id, existing.folderId));

  for (const entry of granted) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "ACCESS_MATRIX_PERMISSION_GRANTED",
      targetType: "domain",
      targetId: domain.id,
      detail: {
        domainName: domain.name,
        subjectType: entry.subjectType,
        subjectKey: entry.subjectKey,
        permission: entry.permission,
        actorName,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }
  for (const entry of revoked) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "ACCESS_MATRIX_PERMISSION_REVOKED",
      targetType: "domain",
      targetId: domain.id,
      detail: {
        domainName: domain.name,
        subjectType: entry.subjectType,
        subjectKey: entry.subjectKey,
        permission: entry.permission,
        actorName,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "ACCESS_MATRIX_UPDATED",
    targetType: "domain",
    targetId: domain.id,
    detail: {
      domainName: domain.name,
      granted: granted.length,
      revoked: revoked.length,
      summary: `${actorName} updated access matrix for "${domain.name}".`,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({
    domainId: domain.id,
    folderId: existing.folderId,
    matrix: newRows.map((r) => ({
      id: r.id,
      subjectType: r.subjectType,
      subjectKey: r.subjectKey,
      permission: r.permission,
    })),
  });
});

// ── DELETE /document-domains/:id ──────────────────────────────────────────────
router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const domain = await db
    .select()
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, String(req.params.id)), eq(protectedDomainsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!domain) { res.status(404).json({ error: "Domain not found" }); return; }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const userLevel = await getUserLevel(userId);

  if (domain.domainProtectionLevel === "past_master_protected" && userLevel < PM_SUPER_LEVEL) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOMAIN_PROTECTION_BLOCKED",
      targetType: "domain",
      targetId: domain.id,
      detail: {
        domainName: domain.name,
        attemptedAction: "delete",
        actorName,
        summary: `${actorName} attempted to delete "${domain.name}" but was denied because the domain is Past Master Protected.`,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.status(403).json({ error: "Only a PM Super Administrator may manage Past Master protected domains." });
    return;
  }

  // Remove explicit user grants for this domain (FK, no cascade)
  await db
    .delete(userDomainAccessTable)
    .where(eq(userDomainAccessTable.domainId, domain.id));

  // document_folders.domainId has onDelete:"set null" — handled by Postgres automatically
  await db.delete(protectedDomainsTable).where(eq(protectedDomainsTable.id, domain.id));

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOMAIN_UPDATED",
    targetType: "domain",
    targetId: domain.id,
    detail: {
      domainName: domain.name,
      deleted: true,
      actorName,
      summary: `${actorName} deleted domain "${domain.name}".`,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ success: true });
});

export default router;
