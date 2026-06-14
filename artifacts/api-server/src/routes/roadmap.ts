import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { roadmapItemsTable, userRolesTable, rolesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["planned", "in-progress", "completed", "future-idea"]),
  sortOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["planned", "in-progress", "completed", "future-idea"]).optional(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })),
});

function formatItem(item: typeof roadmapItemsTable.$inferSelect) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    status: item.status,
    sortOrder: item.sortOrder,
    isVisible: item.isVisible,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

router.get("/", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const userRoles = await db
    .select({ permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, userId));
  const maxLevel = userRoles.reduce((max, r) => Math.max(max, r.permissionLevel), 0);
  const isAdmin = maxLevel >= SITE_ADMIN_LEVEL;

  const items = await db
    .select()
    .from(roadmapItemsTable)
    .where(
      isAdmin
        ? eq(roadmapItemsTable.lodgeId, lodgeId)
        : and(eq(roadmapItemsTable.lodgeId, lodgeId), eq(roadmapItemsTable.isVisible, true)),
    )
    .orderBy(roadmapItemsTable.sortOrder, roadmapItemsTable.createdAt);

  res.json({ items: items.map(formatItem) });
});

router.post("/reorder", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  await Promise.all(
    parsed.data.items.map(({ id, sortOrder }) =>
      db
        .update(roadmapItemsTable)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(roadmapItemsTable.id, id), eq(roadmapItemsTable.lodgeId, lodgeId!))),
    ),
  );

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROADMAP_ITEM_UPDATED",
    detail: { action: "reorder", count: parsed.data.items.length },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  let sortOrder = parsed.data.sortOrder;
  if (sortOrder === undefined) {
    const existing = await db
      .select({ sortOrder: roadmapItemsTable.sortOrder })
      .from(roadmapItemsTable)
      .where(eq(roadmapItemsTable.lodgeId, lodgeId!))
      .orderBy(roadmapItemsTable.sortOrder);
    sortOrder = existing.length > 0 ? existing[existing.length - 1].sortOrder + 1 : 0;
  }

  const [item] = await db
    .insert(roadmapItemsTable)
    .values({
      lodgeId: lodgeId!,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
      sortOrder,
      isVisible: true,
      createdBy: actorId,
    })
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROADMAP_ITEM_CREATED",
    targetType: "roadmap_item",
    targetId: item.id,
    detail: { title: item.title, status: item.status },
    ipAddress: getClientIp(req),
  });

  res.status(201).json(formatItem(item));
});

router.put("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const itemId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const existing = await db
    .select()
    .from(roadmapItemsTable)
    .where(and(eq(roadmapItemsTable.id, itemId), eq(roadmapItemsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Roadmap item not found" });
    return;
  }

  const updates: Partial<typeof roadmapItemsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isVisible !== undefined) updates.isVisible = parsed.data.isVisible;

  const [item] = await db
    .update(roadmapItemsTable)
    .set(updates)
    .where(eq(roadmapItemsTable.id, itemId))
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId,
    action: parsed.data.isVisible === false ? "ROADMAP_ITEM_DELETED" : "ROADMAP_ITEM_UPDATED",
    targetType: "roadmap_item",
    targetId: item.id,
    detail: { title: item.title, changes: parsed.data },
    ipAddress: getClientIp(req),
  });

  res.json(formatItem(item));
});

router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const itemId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db
    .select()
    .from(roadmapItemsTable)
    .where(and(eq(roadmapItemsTable.id, itemId), eq(roadmapItemsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Roadmap item not found" });
    return;
  }

  await db.delete(roadmapItemsTable).where(eq(roadmapItemsTable.id, itemId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROADMAP_ITEM_DELETED",
    targetType: "roadmap_item",
    targetId: itemId,
    detail: { title: existing[0].title },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
