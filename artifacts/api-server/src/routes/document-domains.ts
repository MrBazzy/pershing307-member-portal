import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { protectedDomainsTable, usersTable, documentFoldersTable } from "@workspace/db/schema";
import type { DomainAccessLogic } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const router = Router();

const SITE_ADMIN_LEVEL = 80;
const PM_SUPER_LEVEL = 90;

const ACCESS_LOGIC_VALUES = ["role_only", "degree_only", "role_or_degree", "role_and_degree"] as const;

const createDomainSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(1000).nullable().optional(),
  accessLogic: z.enum(ACCESS_LOGIC_VALUES),
  allowedRoleSlugs: z.array(z.string()).optional().default([]),
  minDegree: z.number().int().min(1).max(3).nullable().optional(),
});

const updateDomainSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

const updateAccessSchema = z.object({
  accessLogic: z.enum(ACCESS_LOGIC_VALUES),
  allowedRoleSlugs: z.array(z.string()).optional(),
  minDegree: z.number().int().min(1).max(3).nullable().optional(),
});

function formatDomain(d: typeof protectedDomainsTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    description: d.description ?? null,
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
router.post("/", requireAuth(), requireRole(PM_SUPER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = createDomainSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const { name, slug, description, accessLogic, allowedRoleSlugs, minDegree } = parsed.data;

  // Check slug uniqueness
  const existing = await db
    .select({ id: protectedDomainsTable.id })
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.lodgeId, lodgeId), eq(protectedDomainsTable.slug, slug)))
    .then((r) => r[0] ?? null);
  if (existing) { res.status(409).json({ error: "A domain with this slug already exists" }); return; }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Admin";

  const [created] = await db
    .insert(protectedDomainsTable)
    .values({
      lodgeId,
      name,
      slug,
      description: description ?? null,
      accessLogic,
      allowedRoleSlugs: allowedRoleSlugs ?? [],
      minDegree: minDegree ?? null,
      createdBy: userId,
    })
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOMAIN_CREATED",
    targetType: "domain",
    targetId: created.id,
    detail: { domainName: name, accessLogic, actorName },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.status(201).json({ domain: formatDomain(created) });
});

// ── PATCH /document-domains/:id ───────────────────────────────────────────────
router.patch("/:id", requireAuth(), requireRole(PM_SUPER_LEVEL), async (req, res) => {
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

  const updates: Partial<typeof protectedDomainsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

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
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ domain: formatDomain(updated) });
});

// ── PATCH /document-domains/:id/access ────────────────────────────────────────
router.patch("/:id/access", requireAuth(), requireRole(PM_SUPER_LEVEL), async (req, res) => {
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

  // Human-readable summary for audit detail
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

// ── DELETE /document-domains/:id ──────────────────────────────────────────────
router.delete("/:id", requireAuth(), requireRole(PM_SUPER_LEVEL), async (req, res) => {
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

  // Unlink any folders referencing this domain before deleting (FK constraint)
  await db
    .update(documentFoldersTable)
    .set({ domainId: null })
    .where(eq(documentFoldersTable.domainId, domain.id));

  await db.delete(protectedDomainsTable).where(eq(protectedDomainsTable.id, domain.id));

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOMAIN_UPDATED",
    targetType: "domain",
    targetId: domain.id,
    detail: { domainName: domain.name, deleted: true, actorName },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ success: true });
});

export default router;
