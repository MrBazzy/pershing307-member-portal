import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  documentFoldersTable,
  protectedDomainsTable,
  usersTable,
} from "@workspace/db/schema";
import type { DocumentStatus, AuditAction } from "@workspace/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { Readable } from "stream";
import { requireAuth } from "../middlewares/requireAuth";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import { getUserVisibilityContext } from "../lib/visibility";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  initialDocumentStatus,
  getFolderWithAccess,
} from "../lib/folderAccess";
import { getEffectivePermissions } from "../lib/matrixPermissions";

const router = Router();
const objectStorageService = new ObjectStorageService();

const MEMBER_LEVEL = 20;
const SITE_ADMIN_LEVEL = 80;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png", ".txt",
]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

// ── Schema ──────────────────────────────────────────────────────────────────

const requestUploadSchema = z.object({
  folderId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  mimeType: z.string().min(1).max(200),
});

const patchDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  folderId: z.string().min(1).optional(),
});

const patchStatusSchema = z.object({
  status: z.enum(["published", "rejected", "archived", "deleted", "withdrawn"]),
  rejectionReason: z.string().max(1000).nullable().optional(),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDocument(
  doc: typeof documentsTable.$inferSelect,
  uploader: { firstName: string; lastName: string; email: string } | null,
  folderTitle: string,
) {
  return {
    id: doc.id,
    folderId: doc.folderId,
    folderTitle,
    uploaderId: doc.uploaderId ?? null,
    uploaderName: uploader ? `${uploader.firstName} ${uploader.lastName}`.trim() : null,
    title: doc.title,
    description: doc.description ?? null,
    originalFileName: doc.originalFileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    status: doc.status,
    rejectionReason: doc.rejectionReason ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// ── POST /documents/request-upload ─────────────────────────────────────────

router.post("/request-upload", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = requestUploadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }
  const { folderId, title, description, fileName, fileSize, mimeType } = parsed.data;

  // Validate file type
  const ext = getExtension(fileName);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    res.status(400).json({ error: `File type '${ext}' is not allowed.` });
    return;
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: `MIME type '${mimeType}' is not allowed.` });
    return;
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    res.status(400).json({ error: "File exceeds 20 MB limit." });
    return;
  }

  // Get user visibility context
  const { maxPermLevel: level, roleSlugs: slugs, maxDegree } = await getUserVisibilityContext(userId);
  if (level < MEMBER_LEVEL) { res.status(403).json({ error: "Members only" }); return; }

  // Check folder exists + access
  const folder = await getFolderWithAccess(folderId, lodgeId);
  if (!folder || folder.lodgeId !== lodgeId) { res.status(404).json({ error: "Folder not found" }); return; }

  req.log.info({
    uploadDiag: true,
    userId,
    userLevel: level,
    userRoles: slugs,
    userMaxDegree: maxDegree,
    requestedFolderId: folderId,
    resolvedFolderId: folder.id,
    resolvedFolderTitle: folder.title,
    resolvedFolderParentId: folder.parentId ?? null,
    resolvedDomainSlug: folder.domainSlug ?? null,
    resolvedDomainAccessLogic: folder.domainAccessLogic ?? null,
    resolvedDomainAllowedRoleSlugs: folder.domainAllowedRoleSlugs ?? null,
    resolvedAccessPolicy: folder.accessPolicy ?? null,
  }, "upload-request: resolved folder");

  // Matrix-based permission check (falls back to legacy domain logic for non-matrix folders)
  const uploadPerms = await getEffectivePermissions(userId, folderId, lodgeId);
  if (!uploadPerms.canView) {
    req.log.warn({
      uploadDiag: true,
      userId,
      userLevel: level,
      resolvedFolderTitle: folder.title,
      resolvedDomainSlug: folder.domainSlug ?? null,
      denialReason: "canView=false from matrix/legacy check",
    }, "upload-request: DENIED — folder access check failed");
    res.status(403).json({ error: "You do not have access to this folder." });
    return;
  }
  if (!uploadPerms.canUpload) {
    req.log.warn({
      uploadDiag: true,
      userId,
      userLevel: level,
      resolvedFolderTitle: folder.title,
      resolvedDomainSlug: folder.domainSlug ?? null,
      denialReason: "canUpload=false from matrix/legacy check",
    }, "upload-request: DENIED — upload rights check failed");
    res.status(403).json({ error: "You do not have upload rights for this folder." });
    return;
  }

  // Generate presigned upload URL
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLWithPath();

  // Determine initial status — if the uploader already has approve rights, publish immediately
  const status = uploadPerms.canApprove ? "published" : initialDocumentStatus(level);

  // Fetch actor info for audit
  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);

  // Get the actual folderId (not the effective access ancestor)
  const targetFolder = await db
    .select({ id: documentFoldersTable.id, title: documentFoldersTable.title })
    .from(documentFoldersTable)
    .where(and(eq(documentFoldersTable.id, folderId), eq(documentFoldersTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!targetFolder) { res.status(404).json({ error: "Folder not found" }); return; }

  // Create document record
  const [doc] = await db.insert(documentsTable).values({
    lodgeId,
    folderId: targetFolder.id,
    uploaderId: userId,
    title,
    description: description ?? null,
    originalFileName: fileName,
    storagePath: objectPath,
    mimeType,
    fileSize,
    status,
  }).returning();

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: "DOCUMENT_UPLOADED",
    targetType: "document",
    targetId: doc.id,
    detail: {
      fileName,
      title,
      folderTitle: targetFolder.title,
      status,
      actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : "",
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.status(201).json({
    documentId: doc.id,
    uploadURL,
    objectPath,
    status,
  });
});

// ── GET /documents?folderId= ────────────────────────────────────────────────

router.get("/", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : null;
  if (!folderId) { res.status(400).json({ error: "folderId query param required" }); return; }

  const { maxPermLevel: level } = await getUserVisibilityContext(userId);
  if (level < MEMBER_LEVEL) { res.json({ documents: [] }); return; }

  // Verify folder exists in this lodge
  const folder = await getFolderWithAccess(folderId, lodgeId);
  if (!folder || folder.lodgeId !== lodgeId) { res.status(404).json({ error: "Folder not found" }); return; }

  // Matrix-based access gate (falls back to legacy logic for non-system folders)
  const folderPerms = await getEffectivePermissions(userId, folderId, lodgeId);
  if (!folderPerms.canView) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  // Get the folder title
  const folderRow = await db
    .select({ title: documentFoldersTable.title })
    .from(documentFoldersTable)
    .where(eq(documentFoldersTable.id, folderId))
    .then((r) => r[0] ?? null);

  const docs = await db
    .select()
    .from(documentsTable)
    .where(and(
      eq(documentsTable.folderId, folderId),
      eq(documentsTable.lodgeId, lodgeId),
    ))
    .orderBy(asc(documentsTable.createdAt));

  // Filter by visibility — members see only published; admins see all statuses
  const isAdmin = level >= SITE_ADMIN_LEVEL;
  const visible = docs.filter((d) => isAdmin || d.status === "published");

  // Fetch uploaders in bulk
  const uploaderIds = [...new Set(visible.map((d) => d.uploaderId).filter(Boolean) as string[])];
  const uploaderMap = new Map<string, { firstName: string; lastName: string; email: string }>();
  if (uploaderIds.length > 0) {
    const users = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, uploaderIds));
    for (const u of users) { uploaderMap.set(u.id, u); }
  }

  res.json({
    documents: visible.map((d) => formatDocument(d, d.uploaderId ? (uploaderMap.get(d.uploaderId) ?? null) : null, folderRow?.title ?? "")),
  });
});

// ── GET /documents/:id/download ─────────────────────────────────────────────

router.get("/:id/download", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const doc = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, String(req.params.id)), eq(documentsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const { maxPermLevel: level } = await getUserVisibilityContext(userId);

  // Check doc visibility — same rules as the list endpoint
  const isAdmin = level >= SITE_ADMIN_LEVEL;
  const isUploader = doc.uploaderId === userId;

  let canSeeDoc: boolean;
  switch (doc.status) {
    case "deleted":
    case "archived":
      canSeeDoc = isAdmin;
      break;
    case "published":
      canSeeDoc = true;
      break;
    case "pending_review":
    case "rejected":
      canSeeDoc = isAdmin || isUploader;
      break;
    default:
      canSeeDoc = isAdmin;
  }

  if (!canSeeDoc) { res.status(403).json({ error: "Access denied" }); return; }

  // Matrix-based folder access gate (admins bypass — they always have full access)
  if (!isAdmin) {
    const folderPerms = await getEffectivePermissions(userId, doc.folderId, lodgeId);
    if (!folderPerms.canView) {
      res.status(403).json({ error: "Access denied" }); return;
    }
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.storagePath);
    const response = await objectStorageService.downloadObject(objectFile, 0);

    // Set download headers
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.originalFileName)}"`);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-disposition") res.setHeader(key, value);
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }

    // Audit after streaming starts (fire-and-forget)
    const actor = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);
    writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOCUMENT_DOWNLOADED",
      targetType: "document",
      targetId: doc.id,
      detail: {
        fileName: doc.originalFileName,
        title: doc.title,
        actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : "",
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    }).catch(() => {});
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage" });
      return;
    }
    req.log.error({ err: error }, "Document download error");
    res.status(500).json({ error: "Download failed" });
  }
});

// ── GET /documents/:id/view ──────────────────────────────────────────────────
// Same as download but Content-Disposition: inline — for in-browser preview.
// Non-published documents are restricted to Site Admin+.

router.get("/:id/view", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const doc = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, String(req.params.id)), eq(documentsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const { maxPermLevel: level } = await getUserVisibilityContext(userId);
  const isAdmin = level >= SITE_ADMIN_LEVEL;

  // Only admins can view non-published documents inline
  let canSeeDoc: boolean;
  switch (doc.status) {
    case "deleted":
    case "archived":
      canSeeDoc = isAdmin;
      break;
    case "published":
      canSeeDoc = true;
      break;
    case "pending_review":
    case "rejected":
      canSeeDoc = isAdmin;
      break;
    default:
      canSeeDoc = isAdmin;
  }

  if (!canSeeDoc) { res.status(403).json({ error: "Access denied" }); return; }

  // Matrix-based folder access gate (bypass for admins — they can always view for review)
  if (!isAdmin) {
    const folderPerms = await getEffectivePermissions(userId, doc.folderId, lodgeId);
    if (!folderPerms.canView) {
      res.status(403).json({ error: "Access denied" }); return;
    }
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(doc.storagePath);
    const response = await objectStorageService.downloadObject(objectFile, 0);

    // Inline disposition — browser renders PDF/images directly.
    // Remove X-Frame-Options so the portal can embed this in a dialog iframe.
    // Chrome checks X-Frame-Options against the top-level origin (Replit IDE),
    // not the direct parent (portal), so SAMEORIGIN would incorrectly block it.
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalFileName)}"`);
    res.setHeader("Content-Type", doc.mimeType);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "content-disposition" && lower !== "content-type") res.setHeader(key, value);
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }

    // Audit fire-and-forget
    const actor = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);
    writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOCUMENT_VIEWED",
      targetType: "document",
      targetId: doc.id,
      detail: {
        fileName: doc.originalFileName,
        title: doc.title,
        status: doc.status,
        actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : "",
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    }).catch(() => {});
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage" });
      return;
    }
    req.log.error({ err: error }, "Document view error");
    res.status(500).json({ error: "View failed" });
  }
});

// ── PATCH /documents/:id ────────────────────────────────────────────────────

router.patch("/:id", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = patchDocumentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const doc = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, String(req.params.id)), eq(documentsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const { maxPermLevel: level } = await getUserVisibilityContext(userId);
  if (level < SITE_ADMIN_LEVEL) { res.status(403).json({ error: "Admin only" }); return; }

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);

  const updates: Partial<typeof documentsTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  // Handle folder move
  let targetFolderTitle: string | null = null;
  let isMoveOperation = false;
  if (parsed.data.folderId && parsed.data.folderId !== doc.folderId) {
    const targetFolder = await db
      .select({ id: documentFoldersTable.id, title: documentFoldersTable.title })
      .from(documentFoldersTable)
      .where(and(eq(documentFoldersTable.id, parsed.data.folderId), eq(documentFoldersTable.lodgeId, lodgeId)))
      .then((r) => r[0] ?? null);
    if (!targetFolder) { res.status(404).json({ error: "Target folder not found" }); return; }
    updates.folderId = targetFolder.id;
    targetFolderTitle = targetFolder.title;
    isMoveOperation = true;
  }

  const [updated] = await db
    .update(documentsTable).set(updates).where(eq(documentsTable.id, doc.id)).returning();

  const currentFolder = await db
    .select({ title: documentFoldersTable.title })
    .from(documentFoldersTable).where(eq(documentFoldersTable.id, updated.folderId)).then((r) => r[0] ?? null);

  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "";

  // Fetch actual uploader for response
  const uploader = doc.uploaderId && doc.uploaderId !== userId
    ? await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, doc.uploaderId)).then((r) => r[0] ?? null)
    : (doc.uploaderId === userId ? actor : null);

  if (isMoveOperation) {
    const sourceFolderRow = await db
      .select({ title: documentFoldersTable.title })
      .from(documentFoldersTable).where(eq(documentFoldersTable.id, doc.folderId)).then((r) => r[0] ?? null);
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOCUMENT_MOVED",
      targetType: "document",
      targetId: doc.id,
      detail: {
        title: updated.title,
        fromFolderTitle: sourceFolderRow?.title ?? "",
        toFolderTitle: targetFolderTitle ?? "",
        actorName,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  if (parsed.data.title !== undefined && parsed.data.title !== doc.title) {
    await writeAuditLog({
      lodgeId,
      actorId: userId,
      actorEmail: actor?.email ?? "",
      action: "DOCUMENT_RENAMED",
      targetType: "document",
      targetId: doc.id,
      detail: {
        oldTitle: doc.title,
        newTitle: parsed.data.title,
        actorName,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });
  }

  res.json(formatDocument(updated, uploader, currentFolder?.title ?? ""));
});

// ── PATCH /documents/:id/status ─────────────────────────────────────────────

router.patch("/:id/status", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const parsed = patchStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() }); return; }

  const doc = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, String(req.params.id)), eq(documentsTable.lodgeId, lodgeId)))
    .then((r) => r[0] ?? null);
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  const { maxPermLevel: level } = await getUserVisibilityContext(userId);
  const isUploader = doc.uploaderId === userId;

  // Uploaders may always withdraw their own pending submissions (no approve needed).
  const isWithdrawByUploader =
    isUploader && doc.status === "pending_review" && parsed.data.status === "withdrawn";

  if (!isWithdrawByUploader) {
    // All other transitions require matrix canApprove (falls back to level ≥ 80 for non-matrix folders)
    const statusPerms = await getEffectivePermissions(userId, doc.folderId, lodgeId);
    if (!statusPerms.canApprove) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
  }

  // isAdmin used for reviewedBy/reviewedAt — treat anyone with approve perms the same
  const isAdmin = !isWithdrawByUploader;

  const actor = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0] ?? null);
  const actorName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "";

  // Fetch uploader name for audit
  let uploaderName = "";
  if (doc.uploaderId && doc.uploaderId !== userId) {
    const uploader = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.id, doc.uploaderId)).then((r) => r[0] ?? null);
    uploaderName = uploader ? `${uploader.firstName} ${uploader.lastName}`.trim() : "";
  }

  const updates: Partial<typeof documentsTable.$inferInsert> = {
    status: parsed.data.status as DocumentStatus,
    updatedAt: new Date(),
    reviewedBy: isAdmin ? userId : doc.reviewedBy,
    reviewedAt: isAdmin ? new Date() : doc.reviewedAt,
  };
  if (parsed.data.status === "rejected") {
    updates.rejectionReason = parsed.data.rejectionReason ?? null;
  }

  const [updated] = await db
    .update(documentsTable).set(updates).where(eq(documentsTable.id, doc.id)).returning();

  const folder = await db
    .select({ title: documentFoldersTable.title })
    .from(documentFoldersTable).where(eq(documentFoldersTable.id, doc.folderId)).then((r) => r[0] ?? null);

  const auditActionMap: Record<string, AuditAction> = {
    published: "DOCUMENT_APPROVED",
    rejected: "DOCUMENT_REJECTED",
    archived: "DOCUMENT_ARCHIVED",
    deleted: "DOCUMENT_DELETED",
    withdrawn: "DOCUMENT_WITHDRAWN",
  };
  const auditAction = auditActionMap[parsed.data.status]!;

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "",
    action: auditAction,
    targetType: "document",
    targetId: doc.id,
    detail: {
      fileName: doc.originalFileName,
      title: doc.title,
      uploaderName: uploaderName || actorName,
      rejectionReason: parsed.data.status === "rejected" ? (parsed.data.rejectionReason ?? null) : undefined,
      actorName,
    },
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.json(formatDocument(updated, actor, folder?.title ?? ""));
});

export default router;
