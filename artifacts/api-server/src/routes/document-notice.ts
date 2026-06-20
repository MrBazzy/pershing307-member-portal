import { Router } from "express";
import { db } from "@workspace/db";
import { userDocumentNoticeAcceptanceTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId } from "../lib/config";
import { writeAuditLog, getClientIp } from "../lib/audit";

const router = Router();

const CURRENT_NOTICE_VERSION = "document-notice-v1";
const PM_SUPER_LEVEL = 90;

router.get("/status", requireAuth, async (req, res) => {
  const lodgeId = await getLodgeId();
  const userId = req.user!.id;

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

router.post("/accept", requireAuth, async (req, res) => {
  const lodgeId = await getLodgeId();
  const userId = req.user!.id;
  const actorEmail = req.user!.email;

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

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail,
    action: "DOCUMENT_NOTICE_ACCEPTED",
    targetType: "notice",
    targetId: CURRENT_NOTICE_VERSION,
    detail: { noticeVersion: CURRENT_NOTICE_VERSION },
    ipAddress: getClientIp(req),
  });

  res.json({ accepted: true, acceptedAt: row.acceptedAt, noticeVersion: CURRENT_NOTICE_VERSION });
});

router.post("/reset", requireAuth, requireRole(PM_SUPER_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  const actorId = req.user!.id;
  const actorEmail = req.user!.email;

  const deleted = await db.delete(userDocumentNoticeAcceptanceTable)
    .where(eq(userDocumentNoticeAcceptanceTable.lodgeId, lodgeId))
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId,
    actorEmail,
    action: "DOCUMENT_NOTICE_RESET",
    targetType: "notice",
    targetId: CURRENT_NOTICE_VERSION,
    detail: { noticeVersion: CURRENT_NOTICE_VERSION, usersReset: deleted.length },
    ipAddress: getClientIp(req),
  });

  res.json({ reset: true, usersReset: deleted.length });
});

export default router;
