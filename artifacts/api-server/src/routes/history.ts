import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { historyPageTable, historyTimelineTable, historyDocumentsTable, historySectionsTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import { ObjectStorageService } from "../lib/objectStorage";
import sanitizeHtml from "sanitize-html";

const objectStorageService = new ObjectStorageService();

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "b", "i", "em", "strong", "u", "s", "strike", "del",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "blockquote", "ul", "ol", "li",
    "a", "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

function sanitizeContent(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const router = Router();
const VISITOR_LEVEL = 10;
const SITE_ADMIN_LEVEL = 80;

const SEED_CONTENT = `General John J. Pershing Lodge No. 307 has a proud and distinguished history within the Masonic fraternity. Founded by dedicated craftsmen committed to the principles of Brotherly Love, Relief, and Truth, the Lodge has served its members and community for many years.

The Lodge is named in honor of General John J. Pershing, a distinguished American soldier who rose to the rank of General of the Armies — the highest rank in the United States Army. General Pershing exemplified the values of integrity, dedication, and service that this Lodge strives to embody.

Over the decades, Pershing Lodge No. 307 has initiated, passed, and raised hundreds of Master Masons, contributing to the growth and vitality of the Craft in this jurisdiction. Through periods of growth and challenge, the Lodge has remained steadfast in its commitment to Masonic principles and the betterment of its members and community.

The history of this Lodge is the history of its members — Brothers who have given their time, talent, and treasure to ensure that the light of Masonry continues to shine brightly for future generations.

This page is maintained to preserve the heritage and memory of all those who have labored in this quarry. Site Administrators may update this content to reflect the Lodge's documented history.`;

// ─── History Page (Our History) ───────────────────────────────────────────────

router.get("/page", requireAuth(), requireRole(VISITOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const rows = await db.select().from(historyPageTable)
    .where(eq(historyPageTable.lodgeId, lodgeId))
    .limit(1);

  if (rows.length === 0) {
    const [created] = await db.insert(historyPageTable)
      .values({ lodgeId, title: "Our History", content: SEED_CONTENT })
      .returning();
    res.json({ page: formatPage(created) });
    return;
  }

  res.json({ page: formatPage(rows[0]) });
});

router.put("/page", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().max(50000),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(historyPageTable)
    .where(eq(historyPageTable.lodgeId, lodgeId)).limit(1);

  let page;
  if (existing.length === 0) {
    [page] = await db.insert(historyPageTable)
      .values({
        lodgeId,
        title: parsed.data.title ?? "Our History",
        content: sanitizeContent(parsed.data.content),
        updatedBy: actorId,
      }).returning();
  } else {
    [page] = await db.update(historyPageTable)
      .set({
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        content: sanitizeContent(parsed.data.content),
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(historyPageTable.id, existing[0].id))
      .returning();
  }

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_PAGE_UPDATED", ipAddress: getClientIp(req) });
  res.json({ page: formatPage(page) });
});

// ─── Timeline ─────────────────────────────────────────────────────────────────

router.get("/timeline", requireAuth(), requireRole(VISITOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const entries = await db.select().from(historyTimelineTable)
    .where(eq(historyTimelineTable.lodgeId, lodgeId))
    .orderBy(asc(historyTimelineTable.year), asc(historyTimelineTable.sortOrder));

  res.json({ entries: entries.map(formatTimelineEntry) });
});

router.post("/timeline", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    year: z.number().int().min(1700).max(9999),
    title: z.string().min(1).max(300),
    description: z.string().max(5000).nullable().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const [entry] = await db.insert(historyTimelineTable)
    .values({
      lodgeId,
      year: parsed.data.year,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
      createdBy: actorId,
    }).returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_TIMELINE_CREATED", targetType: "history_timeline", targetId: entry.id, detail: { year: entry.year, title: entry.title }, ipAddress: getClientIp(req) });
  res.status(201).json(formatTimelineEntry(entry));
});

router.put("/timeline/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const entryId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    year: z.number().int().min(1700).max(9999).optional(),
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).nullable().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(historyTimelineTable)
    .where(and(eq(historyTimelineTable.id, entryId), eq(historyTimelineTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Entry not found" }); return; }

  const [entry] = await db.update(historyTimelineTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(historyTimelineTable.id, entryId))
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_TIMELINE_UPDATED", targetType: "history_timeline", targetId: entryId, ipAddress: getClientIp(req) });
  res.json(formatTimelineEntry(entry));
});

router.delete("/timeline/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const entryId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const existing = await db.select().from(historyTimelineTable)
    .where(and(eq(historyTimelineTable.id, entryId), eq(historyTimelineTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Entry not found" }); return; }

  await db.delete(historyTimelineTable).where(eq(historyTimelineTable.id, entryId));
  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_TIMELINE_DELETED", targetType: "history_timeline", targetId: entryId, detail: { title: existing[0].title }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

// ─── Documents ────────────────────────────────────────────────────────────────

router.get("/documents", requireAuth(), requireRole(VISITOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const docs = await db.select().from(historyDocumentsTable)
    .where(eq(historyDocumentsTable.lodgeId, lodgeId))
    .orderBy(asc(historyDocumentsTable.sortOrder), asc(historyDocumentsTable.createdAt));

  res.json({ documents: docs.map(formatDocument) });
});

router.post("/documents", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(5000).nullable().optional(),
    documentDate: z.string().max(100).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const [doc] = await db.insert(historyDocumentsTable)
    .values({
      lodgeId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      documentDate: parsed.data.documentDate ?? null,
      category: parsed.data.category ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
      createdBy: actorId,
    }).returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_DOCUMENT_CREATED", targetType: "history_document", targetId: doc.id, detail: { title: doc.title }, ipAddress: getClientIp(req) });
  res.status(201).json(formatDocument(doc));
});

router.put("/documents/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const docId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).nullable().optional(),
    documentDate: z.string().max(100).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
    fileUrl: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(historyDocumentsTable)
    .where(and(eq(historyDocumentsTable.id, docId), eq(historyDocumentsTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Document not found" }); return; }

  const [doc] = await db.update(historyDocumentsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(historyDocumentsTable.id, docId))
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_DOCUMENT_UPDATED", targetType: "history_document", targetId: docId, ipAddress: getClientIp(req) });
  res.json(formatDocument(doc));
});

router.post("/documents/:id/request-upload", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const docId = String(req.params.id);
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    name: z.string().min(1),
    size: z.number().int().positive(),
    contentType: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  if (!ALLOWED_ATTACHMENT_TYPES.has(parsed.data.contentType)) {
    res.status(400).json({ error: "Unsupported file type. Allowed: PDF, JPG, PNG, DOCX." });
    return;
  }

  const existing = await db.select().from(historyDocumentsTable)
    .where(and(eq(historyDocumentsTable.id, docId), eq(historyDocumentsTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Document not found" }); return; }

  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

  res.json({ uploadURL, objectPath });
});

router.delete("/documents/:id/attachment", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const docId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const existing = await db.select().from(historyDocumentsTable)
    .where(and(eq(historyDocumentsTable.id, docId), eq(historyDocumentsTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Document not found" }); return; }

  const [doc] = await db.update(historyDocumentsTable)
    .set({ fileUrl: null, updatedAt: new Date() })
    .where(eq(historyDocumentsTable.id, docId))
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_DOCUMENT_UPDATED", targetType: "history_document", targetId: docId, detail: { change: "attachment_removed" }, ipAddress: getClientIp(req) });
  res.json(formatDocument(doc));
});

router.delete("/documents/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const docId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const existing = await db.select().from(historyDocumentsTable)
    .where(and(eq(historyDocumentsTable.id, docId), eq(historyDocumentsTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Document not found" }); return; }

  await db.delete(historyDocumentsTable).where(eq(historyDocumentsTable.id, docId));
  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_DOCUMENT_DELETED", targetType: "history_document", targetId: docId, detail: { title: existing[0].title }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

// ─── History Sections ─────────────────────────────────────────────────────────

router.get("/sections", requireAuth(), requireRole(VISITOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const sections = await db.select().from(historySectionsTable)
    .where(eq(historySectionsTable.lodgeId, lodgeId))
    .orderBy(asc(historySectionsTable.sortOrder), asc(historySectionsTable.createdAt));

  res.json({ sections: sections.map(formatSection) });
});

router.post("/sections", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    yearPeriod: z.string().min(1).max(100),
    chapterTitle: z.string().min(1).max(300),
    bodyText: z.string().max(20000).optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", issues: parsed.error.issues }); return; }

  const [section] = await db.insert(historySectionsTable)
    .values({
      lodgeId,
      yearPeriod: parsed.data.yearPeriod,
      chapterTitle: parsed.data.chapterTitle,
      bodyText: parsed.data.bodyText ?? "",
      sortOrder: parsed.data.sortOrder ?? 0,
      createdBy: actorId,
    }).returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_SECTION_CREATED", targetType: "history_section", targetId: section.id, detail: { chapterTitle: section.chapterTitle }, ipAddress: getClientIp(req) });
  res.status(201).json(formatSection(section));
});

// IMPORTANT: /sections/reorder must be defined before /sections/:id
router.patch("/sections/reorder", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    orderedIds: z.array(z.string()).min(1),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  await Promise.all(
    parsed.data.orderedIds.map((id, idx) =>
      db.update(historySectionsTable)
        .set({ sortOrder: idx, updatedAt: new Date() })
        .where(and(eq(historySectionsTable.id, id), eq(historySectionsTable.lodgeId, lodgeId)))
    )
  );

  const sections = await db.select().from(historySectionsTable)
    .where(eq(historySectionsTable.lodgeId, lodgeId))
    .orderBy(asc(historySectionsTable.sortOrder), asc(historySectionsTable.createdAt));

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_SECTIONS_REORDERED", ipAddress: getClientIp(req) });
  res.json({ sections: sections.map(formatSection) });
});

router.put("/sections/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const sectionId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = z.object({
    yearPeriod: z.string().min(1).max(100).optional(),
    chapterTitle: z.string().min(1).max(300).optional(),
    bodyText: z.string().max(20000).optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const existing = await db.select().from(historySectionsTable)
    .where(and(eq(historySectionsTable.id, sectionId), eq(historySectionsTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Section not found" }); return; }

  const [section] = await db.update(historySectionsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(historySectionsTable.id, sectionId))
    .returning();

  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_SECTION_UPDATED", targetType: "history_section", targetId: sectionId, ipAddress: getClientIp(req) });
  res.json(formatSection(section));
});

router.delete("/sections/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const sectionId = String(req.params.id);
  const lodgeId = await getLodgeId();
  const actorId = req.session!.userId!;
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const existing = await db.select().from(historySectionsTable)
    .where(and(eq(historySectionsTable.id, sectionId), eq(historySectionsTable.lodgeId, lodgeId))).limit(1);
  if (existing.length === 0) { res.status(404).json({ error: "Section not found" }); return; }

  await db.delete(historySectionsTable).where(eq(historySectionsTable.id, sectionId));
  await writeAuditLog({ lodgeId, actorId, action: "HISTORY_SECTION_DELETED", targetType: "history_section", targetId: sectionId, detail: { chapterTitle: existing[0].chapterTitle }, ipAddress: getClientIp(req) });
  res.json({ success: true });
});

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPage(p: typeof historyPageTable.$inferSelect) {
  return { id: p.id, title: p.title, content: p.content, updatedAt: p.updatedAt.toISOString(), createdAt: p.createdAt.toISOString() };
}

function formatTimelineEntry(e: typeof historyTimelineTable.$inferSelect) {
  return { id: e.id, year: e.year, title: e.title, description: e.description ?? null, sortOrder: e.sortOrder, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() };
}

function formatDocument(d: typeof historyDocumentsTable.$inferSelect) {
  return { id: d.id, title: d.title, description: d.description ?? null, documentDate: d.documentDate ?? null, category: d.category ?? null, fileUrl: d.fileUrl ?? null, sortOrder: d.sortOrder, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
}

function formatSection(s: typeof historySectionsTable.$inferSelect) {
  return { id: s.id, yearPeriod: s.yearPeriod, chapterTitle: s.chapterTitle, bodyText: s.bodyText, sortOrder: s.sortOrder, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export default router;
