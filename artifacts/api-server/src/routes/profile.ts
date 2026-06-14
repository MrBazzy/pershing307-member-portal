import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const router = Router();

const visibilitySchema = z.object({
  visibility: z.enum(["hidden", "day_month", "full"]),
});

router.get("/birthday-visibility", requireAuth(), async (req, res) => {
  const actorId = req.session!.userId!;

  const rows = await db
    .select({ birthdayVisibility: usersTable.birthdayVisibility })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ visibility: rows[0].birthdayVisibility });
});

router.patch("/birthday-visibility", requireAuth(), async (req, res) => {
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const parsed = visibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visibility value. Must be hidden, day_month, or full." });
    return;
  }

  const rows = await db
    .select({ id: usersTable.id, birthdayVisibility: usersTable.birthdayVisibility })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const previous = rows[0].birthdayVisibility;
  const updated = parsed.data.visibility;

  await db
    .update(usersTable)
    .set({ birthdayVisibility: updated, updatedAt: new Date() })
    .where(eq(usersTable.id, actorId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "BIRTHDAY_VISIBILITY_CHANGED",
    targetType: "user",
    targetId: actorId,
    detail: { previous, updated, selfService: true },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
