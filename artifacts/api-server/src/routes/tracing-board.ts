import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  tracingBoardEntriesTable,
  tracingBoardCategoriesTable,
  lodgeYearsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, inArray, asc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import { VISIBILITY_VALUES } from "../lib/visibility";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

const DEFAULT_TB_CATEGORIES = [
  { name: "Regular Meeting", description: "Standard lodge meetings" },
  { name: "Degree Night", description: "Degree ceremonies and workings" },
  { name: "Installation Meeting", description: "Installation of lodge officers" },
  { name: "Festive Board", description: "Formal dining after meetings" },
  { name: "Ladies Night", description: "Social events including ladies" },
  { name: "Burns Supper", description: "Annual Burns Night celebration" },
  { name: "Whisky Tasting", description: "Whisky appreciation evenings" },
  { name: "Social Event", description: "Informal social gatherings" },
  { name: "External Visit", description: "Visits to or from other lodges" },
  { name: "Other", description: "Miscellaneous activities" },
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

const entryCreateSchema = z.object({
  lodgeYearId: z.string().min(1),
  title: z.string().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  visibility: z.enum(VISIBILITY_VALUES).default("members"),
});

const entryUpdateSchema = z.object({
  lodgeYearId: z.string().min(1).optional(),
  title: z.string().min(1).max(300).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
});

function formatEntry(e: typeof tracingBoardEntriesTable.$inferSelect, categoryName?: string | null) {
  return {
    id: e.id,
    lodgeYearId: e.lodgeYearId,
    title: e.title,
    date: e.date,
    startTime: e.startTime ?? null,
    endTime: e.endTime ?? null,
    location: e.location ?? null,
    description: e.description ?? null,
    categoryId: e.categoryId ?? null,
    categoryName: categoryName ?? null,
    visibility: e.visibility,
    createdBy: e.createdBy ?? null,
    lastModifiedBy: e.lastModifiedBy ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function formatCategory(c: typeof tracingBoardCategoriesTable.$inferSelect) {
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
    .select({ id: tracingBoardCategoriesTable.id })
    .from(tracingBoardCategoriesTable)
    .where(eq(tracingBoardCategoriesTable.lodgeId, lodgeId));
  if (existing.length > 0) return;
  await db.insert(tracingBoardCategoriesTable).values(
    DEFAULT_TB_CATEGORIES.map(({ name, description }, i) => ({
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

router.get("/categories", requireAuth(), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  await ensureDefaultCategories(lodgeId);

  const categories = await db
    .select()
    .from(tracingBoardCategoriesTable)
    .where(eq(tracingBoardCategoriesTable.lodgeId, lodgeId))
    .orderBy(tracingBoardCategoriesTable.sortOrder, tracingBoardCategoriesTable.name);

  res.json({ categories: categories.map(formatCategory) });
});

router.post("/categories", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = categoryCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const slug = parsed.data.slug ?? parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = await db
    .select({ id: tracingBoardCategoriesTable.id })
    .from(tracingBoardCategoriesTable)
    .where(eq(tracingBoardCategoriesTable.lodgeId, lodgeId!));
  const sortOrder = parsed.data.sortOrder ?? existing.length;

  const [cat] = await db
    .insert(tracingBoardCategoriesTable)
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

  await writeAuditLog({ lodgeId, actorId, action: "TB_CATEGORY_CREATED", targetType: "tb_category", targetId: cat.id, detail: { name: cat.name, description: cat.description }, ipAddress: getClientIp(req) });
  res.status(201).json(formatCategory(cat));
});

router.post("/categories/reorder", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = categoryReorderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  await Promise.all(
    parsed.data.items.map(({ id, sortOrder }) =>
      db.update(tracingBoardCategoriesTable)
        .set({ sortOrder, updatedAt: new Date(), lastModifiedBy: actorId })
        .where(and(eq(tracingBoardCategoriesTable.id, id), eq(tracingBoardCategoriesTable.lodgeId, lodgeId!)))
    )
  );

  await writeAuditLog({ lodgeId, actorId, action: "TB_CATEGORY_REORDERED", targetType: "tb_category", detail: { items: parsed.data.items }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

router.put("/categories/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const catId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = categoryUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(tracingBoardCategoriesTable).where(and(eq(tracingBoardCategoriesTable.id, catId), eq(tracingBoardCategoriesTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Category not found" }); return; }

  const updates: Partial<typeof tracingBoardCategoriesTable.$inferInsert> = { updatedAt: new Date(), lastModifiedBy: actorId };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.slug !== undefined) updates.slug = parsed.data.slug;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [cat] = await db.update(tracingBoardCategoriesTable).set(updates).where(eq(tracingBoardCategoriesTable.id, catId)).returning();

  const wasDisabled = parsed.data.isActive === false && existing[0].isActive === true;
  const auditAction = wasDisabled ? "TB_CATEGORY_DISABLED" : "TB_CATEGORY_UPDATED";
  await writeAuditLog({ lodgeId, actorId, action: auditAction, targetType: "tb_category", targetId: cat.id, detail: { name: cat.name, changes: parsed.data }, ipAddress: getClientIp(req) });
  res.json(formatCategory(cat));
});

router.delete("/categories/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const catId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db.select().from(tracingBoardCategoriesTable).where(and(eq(tracingBoardCategoriesTable.id, catId), eq(tracingBoardCategoriesTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Category not found" }); return; }

  const [{ inUseCount }] = await db
    .select({ inUseCount: count() })
    .from(tracingBoardEntriesTable)
    .where(and(eq(tracingBoardEntriesTable.categoryId, catId), eq(tracingBoardEntriesTable.lodgeId, lodgeId!)));

  if (inUseCount > 0) {
    res.status(409).json({ error: "Category is in use", inUseCount, suggestion: "Disable the category instead of deleting it." });
    return;
  }

  await db.delete(tracingBoardCategoriesTable).where(eq(tracingBoardCategoriesTable.id, catId));
  await writeAuditLog({ lodgeId, actorId, action: "TB_CATEGORY_DELETED", targetType: "tb_category", targetId: catId, detail: { name: existing[0].name }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

router.get("/upcoming", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const [activeYear] = await db
    .select()
    .from(lodgeYearsTable)
    .where(and(eq(lodgeYearsTable.lodgeId, lodgeId), eq(lodgeYearsTable.status, "active")))
    .limit(1);

  if (!activeYear) {
    res.json({ entries: [] });
    return;
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const limit = Math.min(parseInt(String(req.query.limit ?? "5"), 10), 20);

  const entries = await db
    .select()
    .from(tracingBoardEntriesTable)
    .where(and(
      eq(tracingBoardEntriesTable.lodgeId, lodgeId),
      eq(tracingBoardEntriesTable.lodgeYearId, activeYear.id),
      gte(tracingBoardEntriesTable.date, today),
      lte(tracingBoardEntriesTable.date, cutoff),
    ))
    .orderBy(asc(tracingBoardEntriesTable.date), asc(tracingBoardEntriesTable.startTime))
    .limit(limit);

  const catIds = [...new Set(entries.map((e) => e.categoryId).filter(Boolean))] as string[];
  const cats = catIds.length > 0
    ? await db.select().from(tracingBoardCategoriesTable).where(inArray(tracingBoardCategoriesTable.id, catIds))
    : [];
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

  res.json({ entries: entries.map((e) => formatEntry(e, e.categoryId ? catMap[e.categoryId] : null)) });
});

router.get("/", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const lodgeYearId = req.query.lodgeYearId ? String(req.query.lodgeYearId) : undefined;

  let yearId = lodgeYearId;
  if (!yearId) {
    const [activeYear] = await db.select().from(lodgeYearsTable).where(and(eq(lodgeYearsTable.lodgeId, lodgeId), eq(lodgeYearsTable.status, "active"))).limit(1);
    yearId = activeYear?.id;
  }

  if (!yearId) {
    res.json({ entries: [], lodgeYearId: null });
    return;
  }

  const conditions = [
    eq(tracingBoardEntriesTable.lodgeId, lodgeId),
    eq(tracingBoardEntriesTable.lodgeYearId, yearId),
  ];

  const entries = await db
    .select()
    .from(tracingBoardEntriesTable)
    .where(and(...conditions))
    .orderBy(asc(tracingBoardEntriesTable.date), asc(tracingBoardEntriesTable.startTime));

  const catIds = [...new Set(entries.map((e) => e.categoryId).filter(Boolean))] as string[];
  const cats = catIds.length > 0
    ? await db.select().from(tracingBoardCategoriesTable).where(inArray(tracingBoardCategoriesTable.id, catIds))
    : [];
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

  res.json({ entries: entries.map((e) => formatEntry(e, e.categoryId ? catMap[e.categoryId] : null)), lodgeYearId: yearId });
});

router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = entryCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const yearCheck = await db.select().from(lodgeYearsTable).where(and(eq(lodgeYearsTable.id, parsed.data.lodgeYearId), eq(lodgeYearsTable.lodgeId, lodgeId!))).limit(1);
  if (yearCheck.length === 0) { res.status(400).json({ error: "Lodge year not found" }); return; }

  const [entry] = await db
    .insert(tracingBoardEntriesTable)
    .values({
      lodgeId: lodgeId!,
      lodgeYearId: parsed.data.lodgeYearId,
      title: parsed.data.title,
      date: parsed.data.date,
      startTime: parsed.data.startTime ?? null,
      endTime: parsed.data.endTime ?? null,
      location: parsed.data.location ?? null,
      description: parsed.data.description ?? null,
      categoryId: parsed.data.categoryId ?? null,
      visibility: parsed.data.visibility,
      createdBy: actorId,
      lastModifiedBy: actorId,
    })
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "TB_ENTRY_CREATED", targetType: "tb_entry", targetId: entry.id, detail: { title: entry.title, date: entry.date }, ipAddress: getClientIp(req) });
  res.status(201).json(formatEntry(entry));
});

router.put("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const entryId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const parsed = entryUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(tracingBoardEntriesTable).where(and(eq(tracingBoardEntriesTable.id, entryId), eq(tracingBoardEntriesTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Entry not found" }); return; }

  const updates: Partial<typeof tracingBoardEntriesTable.$inferInsert> = { updatedAt: new Date(), lastModifiedBy: actorId };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.date !== undefined) updates.date = parsed.data.date;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;
  if (parsed.data.location !== undefined) updates.location = parsed.data.location;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.categoryId !== undefined) updates.categoryId = parsed.data.categoryId;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;
  if (parsed.data.lodgeYearId !== undefined) updates.lodgeYearId = parsed.data.lodgeYearId;

  const [entry] = await db.update(tracingBoardEntriesTable).set(updates).where(eq(tracingBoardEntriesTable.id, entryId)).returning();

  await writeAuditLog({ lodgeId, actorId, action: "TB_ENTRY_UPDATED", targetType: "tb_entry", targetId: entry.id, detail: { title: entry.title, changes: parsed.data }, ipAddress: getClientIp(req) });
  res.json(formatEntry(entry));
});

router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const entryId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;

  const existing = await db.select().from(tracingBoardEntriesTable).where(and(eq(tracingBoardEntriesTable.id, entryId), eq(tracingBoardEntriesTable.lodgeId, lodgeId!))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Entry not found" }); return; }

  await db.delete(tracingBoardEntriesTable).where(eq(tracingBoardEntriesTable.id, entryId));
  await writeAuditLog({ lodgeId, actorId, action: "TB_ENTRY_DELETED", targetType: "tb_entry", targetId: entryId, detail: { title: existing[0].title }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

export default router;
