import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { rolesTable, userRolesTable, folderAccessMatrixTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";
import { getLodgeId } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { usersTable } from "@workspace/db/schema";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

// ── GET /roles ───────────────────────────────────────────────────────────────

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (_req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const roles = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.lodgeId, lodgeId))
    .orderBy(rolesTable.permissionLevel);

  res.json({ roles });
});

// ── POST /roles ──────────────────────────────────────────────────────────────

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens only"),
  permissionLevel: z.number().int().min(1).max(89),
  description: z.string().max(300).optional().nullable(),
});

router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const { name, slug, permissionLevel, description } = parsed.data;

  const existing = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.lodgeId, lodgeId), eq(rolesTable.slug, slug)))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "A role with that slug already exists" });
    return;
  }

  const [role] = await db
    .insert(rolesTable)
    .values({ lodgeId, name, slug, permissionLevel, description: description ?? null, isSystem: false })
    .returning();

  const actor = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.session!.userId!))
    .then((r) => r[0] ?? null);

  await writeAuditLog({
    lodgeId,
    actorId: req.session!.userId!,
    actorEmail: actor?.email ?? "",
    action: "ROLE_CREATED",
    targetType: "role",
    targetId: role.id,
    detail: { name, slug, permissionLevel },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.status(201).json({ role });
});

// ── PATCH /roles/:id ─────────────────────────────────────────────────────────

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/).optional(),
  permissionLevel: z.number().int().min(1).max(89).optional(),
  description: z.string().max(300).optional().nullable(),
});

router.patch("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const role = await db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.id, req.params.id), eq(rolesTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);

  if (!role) { res.status(404).json({ error: "Role not found" }); return; }

  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const updates: Partial<typeof rolesTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.permissionLevel !== undefined) updates.permissionLevel = parsed.data.permissionLevel;

  if (parsed.data.slug !== undefined) {
    if (role.isSystem) {
      res.status(400).json({ error: "Cannot change the slug of a system role" });
      return;
    }
    const conflict = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(and(eq(rolesTable.lodgeId, lodgeId), eq(rolesTable.slug, parsed.data.slug)))
      .limit(1);
    if (conflict.length > 0 && conflict[0].id !== role.id) {
      res.status(409).json({ error: "A role with that slug already exists" });
      return;
    }
    updates.slug = parsed.data.slug;
  }

  const [updated] = await db
    .update(rolesTable)
    .set(updates)
    .where(eq(rolesTable.id, role.id))
    .returning();

  const actor = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.session!.userId!))
    .then((r) => r[0] ?? null);

  await writeAuditLog({
    lodgeId,
    actorId: req.session!.userId!,
    actorEmail: actor?.email ?? "",
    action: "ROLE_UPDATED",
    targetType: "role",
    targetId: role.id,
    detail: { name: updated.name, slug: updated.slug },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ role: updated });
});

// ── DELETE /roles/:id ────────────────────────────────────────────────────────

router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const role = await db
    .select()
    .from(rolesTable)
    .where(and(eq(rolesTable.id, req.params.id), eq(rolesTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);

  if (!role) { res.status(404).json({ error: "Role not found" }); return; }
  if (role.isSystem) { res.status(400).json({ error: "System roles cannot be deleted" }); return; }

  const [{ assignedCount }] = await db
    .select({ assignedCount: count() })
    .from(userRolesTable)
    .where(eq(userRolesTable.roleId, role.id));

  if (assignedCount > 0) {
    if (req.query.force !== "true") {
      res.status(409).json({
        error: `This role is currently assigned to ${assignedCount} member${assignedCount === 1 ? "" : "s"}.`,
        assignedCount,
      });
      return;
    }
    await db.delete(userRolesTable).where(eq(userRolesTable.roleId, role.id));
  }

  await db.delete(rolesTable).where(eq(rolesTable.id, role.id));

  await db
    .delete(folderAccessMatrixTable)
    .where(
      and(
        eq(folderAccessMatrixTable.lodgeId, lodgeId),
        eq(folderAccessMatrixTable.subjectType, "role"),
        eq(folderAccessMatrixTable.subjectKey, role.slug),
      ),
    );

  const actor = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.session!.userId!))
    .then((r) => r[0] ?? null);

  await writeAuditLog({
    lodgeId,
    actorId: req.session!.userId!,
    actorEmail: actor?.email ?? "",
    action: "ROLE_DELETED",
    targetType: "role",
    targetId: role.id,
    detail: { name: role.name, slug: role.slug },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json({ success: true });
});

export default router;
