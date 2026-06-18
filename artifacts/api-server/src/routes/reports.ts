import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  userRolesTable,
  rolesTable,
  userDegreesTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId } from "../lib/config";

const router = Router();
const SITE_ADMIN_LEVEL = 80;

// ── GET /reports/member-details ───────────────────────────────────────────────
router.get("/member-details", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      membershipStatus: usersTable.membershipStatus,
      isActive: usersTable.isActive,
      dateOfBirth: usersTable.dateOfBirth,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(usersTable)
    .where(eq(usersTable.lodgeId, lodgeId))
    .orderBy(usersTable.lastName, usersTable.firstName);

  if (users.length === 0) {
    res.json({ members: [] });
    return;
  }

  const userIds = users.map((u) => u.id);

  const roleRows = await db
    .select({
      userId: userRolesTable.userId,
      slug: rolesTable.slug,
      name: rolesTable.name,
      permissionLevel: rolesTable.permissionLevel,
    })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(inArray(userRolesTable.userId, userIds));

  const degreeRows = await db
    .select({
      userId: userDegreesTable.userId,
      degree: userDegreesTable.degree,
      conferredOn: userDegreesTable.conferredOn,
      notes: userDegreesTable.notes,
    })
    .from(userDegreesTable)
    .where(inArray(userDegreesTable.userId, userIds))
    .orderBy(userDegreesTable.degree);

  const rolesMap = new Map<string, typeof roleRows>();
  for (const r of roleRows) {
    if (!rolesMap.has(r.userId)) rolesMap.set(r.userId, []);
    rolesMap.get(r.userId)!.push(r);
  }

  const degreesMap = new Map<string, typeof degreeRows>();
  for (const d of degreeRows) {
    if (!degreesMap.has(d.userId)) degreesMap.set(d.userId, []);
    degreesMap.get(d.userId)!.push(d);
  }

  const members = users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    membershipStatus: u.membershipStatus,
    isActive: u.isActive,
    dateOfBirth: u.dateOfBirth ?? null,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    roles: (rolesMap.get(u.id) ?? [])
      .map((r) => ({ slug: r.slug, name: r.name, permissionLevel: r.permissionLevel }))
      .sort((a, b) => b.permissionLevel - a.permissionLevel),
    degrees: (degreesMap.get(u.id) ?? [])
      .map((d) => ({ degree: d.degree, conferredOn: d.conferredOn ?? null, notes: d.notes ?? null }))
      .sort((a, b) => a.degree - b.degree),
  }));

  res.json({ members });
});

export default router;
