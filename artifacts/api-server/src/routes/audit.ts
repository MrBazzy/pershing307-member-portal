import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, ilike } from "drizzle-orm";
import { getLodgeId } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import type { SQL } from "drizzle-orm";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

const filterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().optional(),
  actorEmail: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  targetType: z.string().optional(),
});

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { limit, offset, action, actorEmail, from, to, targetType } = parsed.data;

  const conditions: SQL[] = [eq(auditLogsTable.lodgeId, lodgeId)];

  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (actorEmail) conditions.push(ilike(auditLogsTable.actorEmail, `%${actorEmail}%`));
  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) conditions.push(gte(auditLogsTable.createdAt, fromDate));
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) conditions.push(lte(auditLogsTable.createdAt, toDate));
  }
  if (targetType) conditions.push(eq(auditLogsTable.targetType, targetType));

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(...conditions))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ logs, limit, offset });
});

export default router;
