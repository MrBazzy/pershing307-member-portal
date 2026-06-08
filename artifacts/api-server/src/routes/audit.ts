import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { getLodgeId } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router = Router();
const ADMINISTRATOR_LEVEL = 70;

router.get("/", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.lodgeId, lodgeId))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ logs, limit, offset });
});

export default router;
