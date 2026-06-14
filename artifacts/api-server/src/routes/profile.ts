import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const MEMBER_LEVEL = 20;

const router = Router();

const dobSchema = z.object({
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

const visibilitySchema = z.object({
  visibility: z.enum(["hidden", "day_month", "full"]),
});

// GET /profile/date-of-birth — any authenticated user reads their own DOB
router.get("/date-of-birth", requireAuth(), async (req, res) => {
  const actorId = req.session!.userId!;

  const rows = await db
    .select({ dateOfBirth: usersTable.dateOfBirth })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ dateOfBirth: rows[0].dateOfBirth ?? null });
});

// PATCH /profile/date-of-birth — Member+ updates own DOB; Visitors blocked
router.patch("/date-of-birth", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const parsed = dobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD or null." });
    return;
  }

  const rows = await db
    .select({ id: usersTable.id, dateOfBirth: usersTable.dateOfBirth })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const previous = rows[0].dateOfBirth;
  const updated = parsed.data.dateOfBirth;

  await db
    .update(usersTable)
    .set({ dateOfBirth: updated, updatedAt: new Date() })
    .where(eq(usersTable.id, actorId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DOB_UPDATED",
    targetType: "user",
    targetId: actorId,
    detail: { previous, updated, selfService: true },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

// GET /profile/birthday-visibility — any authenticated user reads own visibility
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

// PATCH /profile/birthday-visibility — Member+ updates own visibility; Visitors blocked
router.patch("/birthday-visibility", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
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
