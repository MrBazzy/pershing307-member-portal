import { Router } from "express";
import { db } from "@workspace/db";
import { userDocumentNoticeAcceptanceTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId } from "../lib/config";
import { writeAuditLog, getClientIp } from "../lib/audit";

const router = Router();

const CURRENT_NOTICE_VERSION = "document-notice-v1";
const PM_SUPER_LEVEL = 90;

router.get("/status", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;

  const row = await db.query.userDocumentNoticeAcceptanceTable.findFirst({
    where: and(
      eq(userDocumentNoticeAcceptanceTable.userId, userId),
      eq(userDocumentNoticeAcceptanceTable.noticeVersion, CURRENT_NOTICE_VERSION)
    ),
  });

  res.json({
    accepted: !!row,
    acceptedAt: row?.acceptedAt ?? null,
    noticeVersion: CURRENT_NOTICE_VERSION,
  });
});

router.post("/accept", requireAuth(), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }
  const userId = req.session!.userId!;

  const existing = await db.query.userDocumentNoticeAcceptanceTable.findFirst({
    where: and(
      eq(userDocumentNoticeAcceptanceTable.userId, userId),
      eq(userDocumentNoticeAcceptanceTable.noticeVersion, CURRENT_NOTICE_VERSION)
    ),
  });

  if (existing) {
    return res.json({ accepted: true, acceptedAt: existing.acceptedAt, noticeVersion: CURRENT_NOTICE_VERSION });
  }

  const [row] = await db.insert(userDocumentNoticeAcceptanceTable).values({
    lodgeId,
    userId,
    noticeVersion: CURRENT_NOTICE_VERSION,
  }).returning();

  const actor = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .then((r) => r[0] ?? null);

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: actor?.email ?? "unknown",
    action: "DOCUMENT_NOTICE_ACCEPTED",
    targetType: "notice",
    targetId: CURRENT_NOTICE_VERSION,
    detail: { noticeVersion: CURRENT_NOTICE_VERSION },
    ipAddress: getClientIp(req),
  });

  return res.json({ accepted: true, acceptedAt: row.acceptedAt, noticeVersion: CURRENT_NOTICE_VERSION });
});

router.post("/reset", requireAuth(), requireRole(PM_SUPER_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }
  const actorId = req.session!.userId!;

  const actor = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .then((r) => r[0] ?? null);

  const deleted = await db.delete(userDocumentNoticeAcceptanceTable)
    .where(eq(userDocumentNoticeAcceptanceTable.lodgeId, lodgeId))
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId,
    actorEmail: actor?.email ?? "unknown",
    action: "DOCUMENT_NOTICE_RESET",
    targetType: "notice",
    targetId: CURRENT_NOTICE_VERSION,
    detail: { noticeVersion: CURRENT_NOTICE_VERSION, usersReset: deleted.length },
    ipAddress: getClientIp(req),
  });

  res.json({ reset: true, usersReset: deleted.length });
});

export default router;
