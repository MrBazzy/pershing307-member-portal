import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { eventsTable, eventCategoriesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, asc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import { VISIBILITY_VALUES } from "../lib/visibility";

const router = Router();
const MEMBER_LEVEL = 20;
const SITE_ADMIN_LEVEL = 80;

const DEFAULT_EVENT_CATEGORIES = [
  { name: "Committee Meeting", description: "Lodge committee meetings" },
  { name: "Candidate Interview", description: "Interviews for prospective candidates" },
  { name: "Home Visit", description: "Visits to members or candidates at home" },
  { name: "Board Meeting", description: "Board of General Purposes meetings" },
  { name: "Practice Session", description: "Ritual practice and rehearsals" },
  { name: "Charity Event", description: "Charity fundraising and community events" },
  { name: "External Visit", description: "Visits to or from other lodges" },
  { name: "Other", description: "Miscellaneous events" },
];

const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  slug: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
});

const categoryUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  slug: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const categoryReorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })).min(1),
});

const eventCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  visibility: z.enum(VISIBILITY_VALUES).default("members"),
  location: z.string().max(300).nullable().optional(),
});

const eventUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  location: z.string().max(300).nullable().optional(),
});

function formatEvent(e: typeof eventsTable.$inferSelect, categoryName?: string | null) {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? null,
    date: e.date,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
    categoryId: e.categoryId ?? null,
    categoryName: categoryName ?? null,
    visibility: e.visibility,
    organizerId: e.organizerId ?? null,
    location: e.location ?? null,
    createdBy: e.createdBy ?? null,
    lastModifiedBy: e.lastModifiedBy ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function formatCategory(c: typeof eventCategoriesTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? null,
    sortOrder: c.sortOrder,
    isSystem: c.isSystem,
    isActive: c.isActive,
    createdBy: c.createdBy ?? null,
    lastModifiedBy: c.lastModifiedBy ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function ensureDefaultCategories(lodgeId: string): Promise<void> {
  const existing = await db
    .select({ id: eventCategoriesTable.id })
    .from(eventCategoriesTable)
    .where(eq(eventCategoriesTable.lodgeId, lodgeId));
  if (existing.length > 0) return;
  await db.insert(eventCategoriesTable).values(
    DEFAULT_EVENT_CATEGORIES.map(({ name, description }, i) => ({
      lodgeId,
      name,
      description,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      sortOrder: i,
      isSystem: true,
      isActive: true,
    }))
  );
}

router.get("/categories", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  await ensureDefaultCategories(lodgeId);

  const categories = await db
    .select()
    .from(eventCategoriesTable)
    .where(eq(eventCategoriesTable.lodgeId, lodgeId))
    .orderBy(eventCategoriesTable.sortOrder, eventCategoriesTable.name);

  res.json({ categories: categories.map(formatCategory) });
});

router.post("/categories", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = categoryCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const slug = parsed.data.slug ?? parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = await db.select({ id: eventCategoriesTable.id }).from(eventCategoriesTable).where(eq(eventCategoriesTable.lodgeId, lodgeId!));
  const sortOrder = parsed.data.sortOrder ?? existing.length;

  const [cat] = await db
    .insert(eventCategoriesTable)
    .values({
      lodgeId: lodgeId!,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      slug,
      sortOrder,
      isSystem: false,
      isActive: true,
      createdBy: actorId,
      lastModifiedBy: actorId,
    })
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "EVENT_CATEGORY_CREATED", targetType: "event_category", targetId: cat.id, detail: { name: cat.name, description: cat.description }, ipAddress: getClientIp(req) });
  res.status(201).json(formatCategory(cat));
});

router.post("/categories/reorder", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = categoryReorderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  await Promise.all(
    parsed.data.items.map(({ id, sortOrder }) =>
      db.update(eventCategoriesTable)
        .set({ sortOrder, updatedAt: new Date(), lastModifiedBy: actorId })
        .where(and(eq(eventCategoriesTable.id, id), eq(eventCategoriesTable.lodgeId, lodgeId!)))
    )
  );

  await writeAuditLog({ lodgeId, actorId, action: "EVENT_CATEGORY_REORDERED", targetType: "event_category", detail: { items: parsed.data.items }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

router.put("/categories/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const catId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = categoryUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(eventCategoriesTable).where(and(eq(eventCategoriesTable.id, catId), eq(eventCategoriesTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Category not found" }); return; }

  const updates: Partial<typeof eventCategoriesTable.$inferInsert> = { updatedAt: new Date(), lastModifiedBy: actorId };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.slug !== undefined) updates.slug = parsed.data.slug;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [cat] = await db.update(eventCategoriesTable).set(updates).where(eq(eventCategoriesTable.id, catId)).returning();

  const wasDisabled = parsed.data.isActive === false && existing[0].isActive === true;
  const auditAction = wasDisabled ? "EVENT_CATEGORY_DISABLED" : "EVENT_CATEGORY_UPDATED";
  await writeAuditLog({ lodgeId, actorId, action: auditAction, targetType: "event_category", targetId: cat.id, detail: { name: cat.name, changes: parsed.data }, ipAddress: getClientIp(req) });
  res.json(formatCategory(cat));
});

router.delete("/categories/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const catId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db.select().from(eventCategoriesTable).where(and(eq(eventCategoriesTable.id, catId), eq(eventCategoriesTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Category not found" }); return; }

  const [{ inUseCount }] = await db
    .select({ inUseCount: count() })
    .from(eventsTable)
    .where(and(eq(eventsTable.categoryId, catId), eq(eventsTable.lodgeId, lodgeId!)));

  if (inUseCount > 0) {
    res.status(409).json({ error: "Category is in use", inUseCount, suggestion: "Disable the category instead of deleting it." });
    return;
  }

  await db.delete(eventCategoriesTable).where(eq(eventCategoriesTable.id, catId));
  await writeAuditLog({ lodgeId, actorId, action: "EVENT_CATEGORY_DELETED", targetType: "event_category", targetId: catId, detail: { name: existing[0].name }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

router.get("/upcoming", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const limit = Math.min(parseInt(String(req.query.limit ?? "5"), 10), 20);

  const events = await db
    .select()
    .from(eventsTable)
    .where(and(
      eq(eventsTable.lodgeId, lodgeId),
      gte(eventsTable.date, today),
      lte(eventsTable.date, cutoff),
    ))
    .orderBy(asc(eventsTable.date), asc(eventsTable.startTime))
    .limit(limit);

  const catIds = [...new Set(events.map((e) => e.categoryId).filter(Boolean))] as string[];
  const cats = catIds.length > 0 ? await db.select().from(eventCategoriesTable).where(inArray(eventCategoriesTable.id, catIds)) : [];
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

  res.json({ events: events.map((e) => formatEvent(e, e.categoryId ? catMap[e.categoryId] : null)) });
});

router.get("/", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const from = req.query.from ? String(req.query.from) : undefined;

  const conditions = [eq(eventsTable.lodgeId, lodgeId)];
  if (from) conditions.push(gte(eventsTable.date, from));

  const events = await db
    .select()
    .from(eventsTable)
    .where(and(...conditions))
    .orderBy(asc(eventsTable.date), asc(eventsTable.startTime));

  const catIds = [...new Set(events.map((e) => e.categoryId).filter(Boolean))] as string[];
  const cats = catIds.length > 0 ? await db.select().from(eventCategoriesTable).where(inArray(eventCategoriesTable.id, catIds)) : [];
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

  res.json({ events: events.map((e) => formatEvent(e, e.categoryId ? catMap[e.categoryId] : null)) });
});

router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = eventCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const [event] = await db
    .insert(eventsTable)
    .values({
      lodgeId: lodgeId!,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      date: parsed.data.date,
      startTime: parsed.data.startTime ?? null,
      endTime: parsed.data.endTime ?? null,
      categoryId: parsed.data.categoryId ?? null,
      visibility: parsed.data.visibility,
      organizerId: actorId,
      location: parsed.data.location ?? null,
      createdBy: actorId,
      lastModifiedBy: actorId,
    })
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "EVENT_CREATED", targetType: "event", targetId: event.id, detail: { title: event.title, date: event.date }, ipAddress: getClientIp(req) });
  res.status(201).json(formatEvent(event));
});

router.put("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const eventId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = eventUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  const updates: Partial<typeof eventsTable.$inferInsert> = { updatedAt: new Date(), lastModifiedBy: actorId };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.date !== undefined) updates.date = parsed.data.date;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;
  if (parsed.data.categoryId !== undefined) updates.categoryId = parsed.data.categoryId;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;
  if (parsed.data.location !== undefined) updates.location = parsed.data.location;

  const [event] = await db.update(eventsTable).set(updates).where(eq(eventsTable.id, eventId)).returning();

  await writeAuditLog({ lodgeId, actorId, action: "EVENT_UPDATED", targetType: "event", targetId: event.id, detail: { title: event.title, changes: parsed.data }, ipAddress: getClientIp(req) });
  res.json(formatEvent(event));
});

router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const eventId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db.select().from(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Event not found" }); return; }

  await db.delete(eventsTable).where(eq(eventsTable.id, eventId));
  await writeAuditLog({ lodgeId, actorId, action: "EVENT_DELETED", targetType: "event", targetId: eventId, detail: { title: existing[0].title }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

export default router;
