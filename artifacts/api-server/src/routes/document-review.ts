import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, documentFoldersTable, usersTable } from "@workspace/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId } from "../lib/config";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

// ── GET /document-review ────────────────────────────────────────────────────

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const docs = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.lodgeId, lodgeId),
      eq(documentsTable.status, "pending_review"),
    ))
    .orderBy(asc(documentsTable.createdAt));

  if (docs.length === 0) {
    res.json({ documents: [], pendingCount: 0 });
    return;
  }

  // Fetch folder titles
  const folderIds = [...new Set(docs.map((d) => d.folderId))];
  const folders = await db
    .select({ id: documentFoldersTable.id, title: documentFoldersTable.title })
    .from(documentFoldersTable)
    .where(eq(documentFoldersTable.lodgeId, lodgeId));
  const folderMap = new Map(folders.map((f) => [f.id, f.title]));

  // Fetch uploaders
  const uploaderIds = [...new Set(docs.map((d) => d.uploaderId).filter(Boolean) as string[])];
  const uploaderMap = new Map<string, { firstName: string; lastName: string; email: string }>();
  if (uploaderIds.length > 0) {
    const users = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
      .from(usersTable);
    for (const u of users) { uploaderMap.set(u.id, u); }
  }

  res.json({
    documents: docs.map((d) => {
      const uploader = d.uploaderId ? (uploaderMap.get(d.uploaderId) ?? null) : null;
      return {
        id: d.id,
        folderId: d.folderId,
        folderTitle: folderMap.get(d.folderId) ?? "",
        uploaderId: d.uploaderId ?? null,
        uploaderFirstName: uploader?.firstName ?? null,
        uploaderLastName: uploader?.lastName ?? null,
        uploaderEmail: uploader?.email ?? null,
        title: d.title,
        description: d.description ?? null,
        originalFileName: d.originalFileName,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
      };
    }),
    pendingCount: docs.length,
  });
});

// ── GET /document-review/count ──────────────────────────────────────────────

router.get("/count", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const docs = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(
      eq(documentsTable.lodgeId, lodgeId),
      eq(documentsTable.status, "pending_review"),
    ));

  res.json({ pendingCount: docs.length });
});

export default router;
