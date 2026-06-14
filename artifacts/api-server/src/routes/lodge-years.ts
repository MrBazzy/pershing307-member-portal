import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { lodgeYearsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

const createSchema = z.object({
  title: z.string().min(1).max(100),
  startYear: z.number().int().min(2000).max(2100),
  endYear: z.number().int().min(2000).max(2100),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
  endYear: z.number().int().min(2000).max(2100).optional(),
});

function formatYear(y: typeof lodgeYearsTable.$inferSelect) {
  return {
    id: y.id,
    title: y.title,
    startYear: y.startYear,
    endYear: y.endYear,
    status: y.status,
    createdAt: y.createdAt.toISOString(),
    updatedAt: y.updatedAt.toISOString(),
  };
}

router.get("/", requireAuth(), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const years = await db
    .select()
    .from(lodgeYearsTable)
    .where(eq(lodgeYearsTable.lodgeId, lodgeId))
    .orderBy(lodgeYearsTable.startYear);

  res.json({ years: years.map(formatYear) });
});

router.get("/active", requireAuth(), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const [year] = await db
    .select()
    .from(lodgeYearsTable)
    .where(and(eq(lodgeYearsTable.lodgeId, lodgeId), eq(lodgeYearsTable.status, "active")))
    .limit(1);

  res.json({ year: year ? formatYear(year) : null });
});

router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const [year] = await db
    .insert(lodgeYearsTable)
    .values({
      lodgeId: lodgeId!,
      title: parsed.data.title,
      startYear: parsed.data.startYear,
      endYear: parsed.data.endYear,
      status: "draft",
      createdBy: actorId,
    })
    .returning();

  await writeAuditLog({
    lodgeId, actorId, action: "LODGE_YEAR_CREATED",
    targetType: "lodge_year", targetId: year.id,
    detail: { title: year.title },
    ipAddress: getClientIp(req),
  });

  res.status(201).json(formatYear(year));
});

router.put("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const yearId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db
    .select()
    .from(lodgeYearsTable)
    .where(and(eq(lodgeYearsTable.id, yearId), eq(lodgeYearsTable.lodgeId, lodgeId!)))
    .limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Lodge year not found" }); return; }
  if (existing[0].status === "archived") { res.status(400).json({ error: "Cannot edit an archived lodge year" }); return; }

  const updates: Partial<typeof lodgeYearsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.startYear !== undefined) updates.startYear = parsed.data.startYear;
  if (parsed.data.endYear !== undefined) updates.endYear = parsed.data.endYear;

  const [year] = await db.update(lodgeYearsTable).set(updates).where(eq(lodgeYearsTable.id, yearId)).returning();

  await writeAuditLog({
    lodgeId, actorId, action: "LODGE_YEAR_UPDATED",
    targetType: "lodge_year", targetId: year.id,
    detail: { title: year.title, changes: parsed.data },
    ipAddress: getClientIp(req),
  });

  res.json(formatYear(year));
});

router.post("/:id/activate", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const yearId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db
    .select()
    .from(lodgeYearsTable)
    .where(and(eq(lodgeYearsTable.id, yearId), eq(lodgeYearsTable.lodgeId, lodgeId!)))
    .limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Lodge year not found" }); return; }
  if (existing[0].status === "archived") { res.status(400).json({ error: "Cannot activate an archived year" }); return; }

  await db
    .update(lodgeYearsTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(lodgeYearsTable.lodgeId, lodgeId!), eq(lodgeYearsTable.status, "active")));

  const [year] = await db
    .update(lodgeYearsTable)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(lodgeYearsTable.id, yearId))
    .returning();

  await writeAuditLog({
    lodgeId, actorId, action: "LODGE_YEAR_ACTIVATED",
    targetType: "lodge_year", targetId: year.id,
    detail: { title: year.title },
    ipAddress: getClientIp(req),
  });

  res.json(formatYear(year));
});

router.post("/:id/archive", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const yearId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db
    .select()
    .from(lodgeYearsTable)
    .where(and(eq(lodgeYearsTable.id, yearId), eq(lodgeYearsTable.lodgeId, lodgeId!)))
    .limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Lodge year not found" }); return; }
  if (existing[0].status === "archived") { res.status(400).json({ error: "Already archived" }); return; }

  const [year] = await db
    .update(lodgeYearsTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(lodgeYearsTable.id, yearId))
    .returning();

  await writeAuditLog({
    lodgeId, actorId, action: "LODGE_YEAR_ARCHIVED",
    targetType: "lodge_year", targetId: year.id,
    detail: { title: year.title },
    ipAddress: getClientIp(req),
  });

  res.json(formatYear(year));
});

router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const yearId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db
    .select()
    .from(lodgeYearsTable)
    .where(and(eq(lodgeYearsTable.id, yearId), eq(lodgeYearsTable.lodgeId, lodgeId!)))
    .limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Lodge year not found" }); return; }
  if (existing[0].status !== "draft") { res.status(400).json({ error: "Only draft lodge years can be deleted" }); return; }

  await db.delete(lodgeYearsTable).where(eq(lodgeYearsTable.id, yearId));

  await writeAuditLog({
    lodgeId, actorId, action: "LODGE_YEAR_DELETED",
    targetType: "lodge_year", targetId: yearId,
    detail: { title: existing[0].title },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
