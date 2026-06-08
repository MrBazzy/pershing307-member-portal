import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, userRolesTable, rolesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router = Router();

const ADMINISTRATOR_LEVEL = 70;
const SITE_ADMIN_LEVEL = 80;

router.get("/", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      displayName: usersTable.displayName,
      membershipStatus: usersTable.membershipStatus,
      isActive: usersTable.isActive,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.lodgeId, lodgeId))
    .orderBy(usersTable.lastName, usersTable.firstName);

  res.json({ users });
});

router.get("/:id", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const userId = String(req.params.id);
  const lodgeId = await getLodgeId();

  const users = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = users[0];

  const roles = await db
    .select({ id: rolesTable.id, name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      membershipStatus: user.membershipStatus,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      roles,
    },
  });
});

router.patch("/:id/deactivate", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  if (targetId === actorId) {
    res.status(400).json({ error: "You cannot deactivate your own account" });
    return;
  }

  const users = await db
    .select({ isBootstrapAdmin: usersTable.isBootstrapAdmin })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (users[0].isBootstrapAdmin) {
    res.status(403).json({ error: "The bootstrap administrator cannot be deactivated" });
    return;
  }

  await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, targetId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "USER_DEACTIVATED",
    targetType: "user",
    targetId,
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.patch("/:id/activate", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable).set({ isActive: true, updatedAt: new Date() }).where(eq(usersTable.id, targetId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "USER_ACTIVATED",
    targetType: "user",
    targetId,
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.post("/:id/roles", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const schema = z.object({ roleId: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { roleId } = result.data;

  const roles = await db
    .select({ id: rolesTable.id, name: rolesTable.name, slug: rolesTable.slug, lodgeId: rolesTable.lodgeId })
    .from(rolesTable)
    .where(eq(rolesTable.id, roleId))
    .limit(1);

  if (roles.length === 0 || roles[0].lodgeId !== lodgeId) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  await db
    .insert(userRolesTable)
    .values({ userId: targetId, roleId, grantedBy: actorId })
    .onConflictDoNothing();

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROLE_GRANTED",
    targetType: "user",
    targetId,
    detail: { roleId, roleName: roles[0].name },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.delete("/:id/roles/:roleId", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const targetRoleId = String(req.params.roleId);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const roles = await db
    .select({ name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, targetRoleId))
    .limit(1);

  await db
    .delete(userRolesTable)
    .where(and(eq(userRolesTable.userId, targetId), eq(userRolesTable.roleId, targetRoleId)));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROLE_REVOKED",
    targetType: "user",
    targetId,
    detail: { roleId: targetRoleId, roleName: roles[0]?.name },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
