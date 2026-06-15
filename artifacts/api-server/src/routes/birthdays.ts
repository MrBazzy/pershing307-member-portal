import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId } from "../lib/config";

const router = Router();
const MEMBER_LEVEL = 20;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function computeBirthday(dob: string, today: Date) {
  const parts = dob.split("-");
  const birthYear = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisYear = new Date(today.getFullYear(), month - 1, day);
  const nextYear = new Date(today.getFullYear() + 1, month - 1, day);

  const nextBirthday = thisYear >= todayMidnight ? thisYear : nextYear;
  const daysUntil = Math.round(
    (nextBirthday.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24),
  );

  const hadBirthdayThisYear = todayMidnight >= new Date(today.getFullYear(), month - 1, day);
  const age = today.getFullYear() - birthYear - (hadBirthdayThisYear ? 0 : 1);

  return { month, day, daysUntil, birthYear, age };
}

type BirthdayEntry = {
  id: string;
  firstName: string;
  lastName: string;
  month: number;
  day: number;
  daysUntil: number;
  year?: number;
  age?: number;
};

const VISIBLE_FILTER = and(
  isNotNull(usersTable.dateOfBirth),
  ne(usersTable.birthdayVisibility, "hidden"),
  eq(usersTable.isActive, true),
  eq(usersTable.membershipStatus, "active"),
);

router.get("/upcoming", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
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
      birthdayVisibility: usersTable.birthdayVisibility,
    })
    .from(usersTable)
    .where(and(eq(usersTable.lodgeId, lodgeId), VISIBLE_FILTER));

  const today = new Date();
  const birthdays: BirthdayEntry[] = users
    .filter((u) => u.dateOfBirth !== null)
    .map((u) => {
      const { month, day, daysUntil, birthYear, age } = computeBirthday(u.dateOfBirth!, today);
      const entry: BirthdayEntry = { id: u.id, firstName: u.firstName, lastName: u.lastName, month, day, daysUntil };
      if (u.birthdayVisibility === "full") {
        entry.year = birthYear;
        entry.age = age;
      }
      return entry;
    })
    .filter((b) => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  res.json({ birthdays });
});

router.get("/", requireAuth(), requireRole(MEMBER_LEVEL), async (req, res) => {
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
      birthdayVisibility: usersTable.birthdayVisibility,
    })
    .from(usersTable)
    .where(and(eq(usersTable.lodgeId, lodgeId), VISIBLE_FILTER));

  const today = new Date();
  const allBirthdays: BirthdayEntry[] = users
    .filter((u) => u.dateOfBirth !== null)
    .map((u) => {
      const { month, day, daysUntil, birthYear, age } = computeBirthday(u.dateOfBirth!, today);
      const entry: BirthdayEntry = { id: u.id, firstName: u.firstName, lastName: u.lastName, month, day, daysUntil };
      if (u.birthdayVisibility === "full") {
        entry.year = birthYear;
        entry.age = age;
      }
      return entry;
    })
    .sort((a, b) => a.month - b.month || a.day - b.day);

  const byMonth: Record<number, BirthdayEntry[]> = {};
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
