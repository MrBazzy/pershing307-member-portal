import { Router } from "express";
import { db } from "@workspace/db";
import { rolesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getLodgeId } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (_req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const roles = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.lodgeId, lodgeId))
    .orderBy(rolesTable.permissionLevel);

  res.json({ roles });
});

export default router;
