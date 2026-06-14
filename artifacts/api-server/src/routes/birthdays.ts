import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getLodgeId } from "../lib/config";

const router = Router();

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function computeBirthday(dob: string, today: Date) {
  const parts = dob.split("-");
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  const nextYear = new Date(today.getFullYear() + 1, month - 1, day);

  const nextBirthday = thisYear >= todayMidnight ? thisYear : nextYear;
  const daysUntil = Math.round(
    (nextBirthday.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { month, day, daysUntil };
}

router.get("/upcoming", requireAuth(), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      dateOfBirth: usersTable.dateOfBirth,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.lodgeId, lodgeId),
        eq(usersTable.isActive, true),
        isNotNull(usersTable.dateOfBirth),
      ),
    );

  const today = new Date();
  const birthdays = users
    .filter((u) => u.dateOfBirth !== null)
    .map((u) => {
      const { month, day, daysUntil } = computeBirthday(u.dateOfBirth!, today);
      return { id: u.id, firstName: u.firstName, lastName: u.lastName, month, day, daysUntil };
    })
    .filter((b) => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  res.json({ birthdays });
});

router.get("/", requireAuth(), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      dateOfBirth: usersTable.dateOfBirth,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.lodgeId, lodgeId),
        eq(usersTable.isActive, true),
        isNotNull(usersTable.dateOfBirth),
      ),
    );

  const today = new Date();
  const allBirthdays = users
    .filter((u) => u.dateOfBirth !== null)
    .map((u) => {
      const { month, day, daysUntil } = computeBirthday(u.dateOfBirth!, today);
      return { id: u.id, firstName: u.firstName, lastName: u.lastName, month, day, daysUntil };
    })
    .sort((a, b) => a.month - b.month || a.day - b.day);

  const byMonth: Record<number, typeof allBirthdays> = {};
  for (const b of allBirthdays) {
    if (!byMonth[b.month]) byMonth[b.month] = [];
    byMonth[b.month].push(b);
  }

  const months = Object.entries(byMonth)
    .map(([m, bs]) => ({
      month: Number(m),
      monthName: MONTH_NAMES[Number(m) - 1],
      birthdays: bs,
    }))
    .sort((a, b) => a.month - b.month);

  res.json({ months });
});

export default router;
