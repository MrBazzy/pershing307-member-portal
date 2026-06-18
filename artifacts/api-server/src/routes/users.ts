import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  usersTable,
  userRolesTable,
  rolesTable,
  userDomainAccessTable,
  protectedDomainsTable,
  userDegreesTable,
  invitationsTable,
  passwordResetTokensTable,
  twoFactorSettingsTable,
  passwordHistoryTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, and, or, ilike, count } from "drizzle-orm";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId, getConfig } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { invalidateUserSessions, markSessionsAsForceLogout } from "../lib/sessions";
import { isTestResetEnabled } from "../lib/env";

const router = Router();

const SITE_ADMIN_LEVEL = 80;
const PM_SUPER_ADMIN_LEVEL = 90;

const PRIVILEGED_ROLE_SLUGS = new Set(["site-administrator", "pm-super-administrator"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { limit, offset, search } = query.data;

  const conditions = [eq(usersTable.lodgeId, lodgeId)];
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(usersTable.firstName, term),
        ilike(usersTable.lastName, term),
        ilike(usersTable.email, term),
        ilike(usersTable.displayName, term)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [totalResult, users] = await Promise.all([
    db.select({ count: count() }).from(usersTable).where(whereClause),
    db
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
      .where(whereClause)
      .orderBy(usersTable.lastName, usersTable.firstName)
      .limit(limit)
      .offset(offset),
  ]);

  res.json({ users, total: totalResult[0]?.count ?? 0, limit, offset });
});

router.get("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
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
      dateOfBirth: user.dateOfBirth ?? null,
      birthdayVisibility: user.birthdayVisibility,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      roles,
    },
    testResetEnabled: isTestResetEnabled(),
  });
});

router.patch("/:id/deactivate", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
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

  const pmSuperRowsDeact = await db
    .select({ userId: userRolesTable.userId })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(rolesTable.slug, "pm-super-administrator"));
  if (
    pmSuperRowsDeact.some((r) => r.userId === targetId) &&
    pmSuperRowsDeact.filter((r) => r.userId !== targetId).length === 0
  ) {
    res.status(400).json({ error: "Cannot deactivate the final PM Super Administrator." });
    return;
  }

  await db.update(usersTable).set({ isActive: false, updatedAt: new Date() }).where(eq(usersTable.id, targetId));

  const deactSessionsInvalidated = await markSessionsAsForceLogout(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "USER_DEACTIVATED",
    targetType: "user",
    targetId,
    detail: { sessionsInvalidated: deactSessionsInvalidated },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.patch("/:id/activate", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
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

  await db
    .update(usersTable)
    .set({ isActive: true, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(usersTable.id, targetId));

  const actSessionsInvalidated = await markSessionsAsForceLogout(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "USER_ACTIVATED",
    targetType: "user",
    targetId,
    detail: { sessionsInvalidated: actSessionsInvalidated },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.post("/:id/reset-password", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  if (targetId === actorId) {
    res.status(400).json({ error: "You cannot reset your own password via this action." });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const pmSuperRows = await db
    .select({ userId: userRolesTable.userId })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(rolesTable.slug, "pm-super-administrator"));

  const targetIsPmSuper = pmSuperRows.some((r) => r.userId === targetId);
  const otherPmSupers = pmSuperRows.filter((r) => r.userId !== targetId);
  if (targetIsPmSuper && otherPmSupers.length === 0) {
    res.status(403).json({ error: "Cannot reset the password of the sole PM Super Administrator. Promote another member first." });
    return;
  }

  const { hashPassword } = await import("../lib/password");
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(usersTable).set({
    passwordHash,
    mustChangePassword: true,
    tempPasswordExpiresAt: expiresAt,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, targetId));

  const sessionsInvalidated = await markSessionsAsForceLogout(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "PASSWORD_RESET_BY_ADMIN",
    targetType: "user",
    targetId,
    detail: { sessionsInvalidated, expiresAt: expiresAt.toISOString() },
    ipAddress: getClientIp(req),
  });

  res.json({ tempPassword, expiresAt: expiresAt.toISOString() });
});

function generateTempPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*";

  const randomByte = () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  };

  const pickFrom = (charset: string, count: number): string[] =>
    Array.from({ length: count }, () => charset[randomByte() % charset.length]);

  const chars = [
    ...pickFrom(upper, 4),
    ...pickFrom(lower, 4),
    ...pickFrom(digits, 4),
    ...pickFrom(special, 4),
  ];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomByte() % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

router.delete("/:id/test-reset", requireAuth(), requireRole(PM_SUPER_ADMIN_LEVEL), async (req, res) => {
  if (!isTestResetEnabled()) {
    res.status(403).json({ error: "Test user reset is disabled in this environment." });
    return;
  }

  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  if (targetId === actorId) {
    res.status(400).json({ error: "You cannot remove your own account." });
    return;
  }

  const users = await db
    .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const target = users[0];

  const pmSupers = await db
    .select({ userId: userRolesTable.userId })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(rolesTable.slug, "pm-super-administrator"));

  const targetIsPmSuper = pmSupers.some((r) => r.userId === targetId);
  const remainingPmSupers = new Set(pmSupers.filter((r) => r.userId !== targetId).map((r) => r.userId));
  if (targetIsPmSuper && remainingPmSupers.size === 0) {
    res.status(400).json({ error: "Cannot remove the final PM Super Administrator." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(auditLogsTable).set({ actorId: null }).where(eq(auditLogsTable.actorId, targetId));

    await tx.update(invitationsTable).set({ revokedBy: null }).where(eq(invitationsTable.revokedBy, targetId));
    await tx.update(invitationsTable).set({ acceptedByUser: null }).where(eq(invitationsTable.acceptedByUser, targetId));

    await tx.delete(invitationsTable).where(eq(invitationsTable.email, target.email));
    await tx.delete(invitationsTable).where(eq(invitationsTable.invitedBy, targetId));

    await tx.update(userRolesTable).set({ grantedBy: null }).where(eq(userRolesTable.grantedBy, targetId));
    await tx.update(userDomainAccessTable).set({ grantedBy: null }).where(eq(userDomainAccessTable.grantedBy, targetId));

    await tx.delete(userRolesTable).where(eq(userRolesTable.userId, targetId));
    await tx.delete(userDomainAccessTable).where(eq(userDomainAccessTable.userId, targetId));
    await tx.delete(userDegreesTable).where(eq(userDegreesTable.userId, targetId));
    await tx.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, targetId));
    await tx.delete(twoFactorSettingsTable).where(eq(twoFactorSettingsTable.userId, targetId));
    await tx.delete(passwordHistoryTable).where(eq(passwordHistoryTable.userId, targetId));

    await tx.delete(usersTable).where(eq(usersTable.id, targetId));
  });

  await invalidateUserSessions(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "TEST_USER_RESET",
    targetType: "user",
    targetId,
    detail: {
      email: target.email,
      name: `${target.firstName} ${target.lastName}`,
      env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
    },
    ipAddress: getClientIp(req),
  });

  res.json({
    success: true,
    message: `Test user ${target.email} removed. The email address can now be invited again.`,
  });
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

  if (roles[0].slug === "pm-super-administrator" && (req.userPermissionLevel ?? 0) < PM_SUPER_ADMIN_LEVEL) {
    res.status(403).json({ error: "Only a PM Super Administrator may grant the PM Super Administrator role." });
    return;
  }

  await db
    .insert(userRolesTable)
    .values({ userId: targetId, roleId, grantedBy: actorId })
    .onConflictDoNothing();

  const grantRoleSessionsInvalidated = await markSessionsAsForceLogout(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROLE_GRANTED",
    targetType: "user",
    targetId,
    detail: { roleId, roleName: roles[0].name, sessionsInvalidated: grantRoleSessionsInvalidated },
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
    .select({ name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(rolesTable)
    .where(eq(rolesTable.id, targetRoleId))
    .limit(1);

  if (roles[0]?.slug === "pm-super-administrator") {
    if ((req.userPermissionLevel ?? 0) < PM_SUPER_ADMIN_LEVEL) {
      res.status(403).json({ error: "Only a PM Super Administrator may remove the PM Super Administrator role." });
      return;
    }
    const pmSuperRowsRevoke = await db
      .select({ userId: userRolesTable.userId })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(rolesTable.slug, "pm-super-administrator"));
    if (pmSuperRowsRevoke.filter((r) => r.userId !== targetId).length === 0) {
      res.status(400).json({ error: "Cannot remove the PM Super Administrator role from the final holder." });
      return;
    }
  }

  await db
    .delete(userRolesTable)
    .where(and(eq(userRolesTable.userId, targetId), eq(userRolesTable.roleId, targetRoleId)));

  const revokeRoleSessionsInvalidated = await markSessionsAsForceLogout(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "ROLE_REVOKED",
    targetType: "user",
    targetId,
    detail: { roleId: targetRoleId, roleName: roles[0]?.name, sessionsInvalidated: revokeRoleSessionsInvalidated },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.get("/:id/domains", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.id);

  const grants = await db
    .select({
      domainId: userDomainAccessTable.domainId,
      domainName: protectedDomainsTable.name,
      domainSlug: protectedDomainsTable.slug,
      grantedAt: userDomainAccessTable.grantedAt,
    })
    .from(userDomainAccessTable)
    .innerJoin(protectedDomainsTable, eq(userDomainAccessTable.domainId, protectedDomainsTable.id))
    .where(eq(userDomainAccessTable.userId, targetUserId));

  res.json({ domains: grants.map((g) => ({ ...g, grantedAt: g.grantedAt.toISOString() })) });
});

const domainGrantSchema = z.object({ domainId: z.string().min(1) });

router.post("/:id/domains", requireAuth(), requireRole(PM_SUPER_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const result = domainGrantSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { domainId } = result.data;

  const domains = await db
    .select({ id: protectedDomainsTable.id, name: protectedDomainsTable.name })
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, domainId), eq(protectedDomainsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (domains.length === 0) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  await db
    .insert(userDomainAccessTable)
    .values({ userId: targetUserId, domainId, grantedBy: actorId })
    .onConflictDoNothing();

  const grantDomainSessionsInvalidated = await markSessionsAsForceLogout(targetUserId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DOMAIN_ACCESS_GRANTED",
    targetType: "user",
    targetId: targetUserId,
    detail: { domainId, domainName: domains[0].name, sessionsInvalidated: grantDomainSessionsInvalidated },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.delete("/:id/domains/:domainId", requireAuth(), requireRole(PM_SUPER_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.id);
  const domainId = String(req.params.domainId);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const domains = await db
    .select({ name: protectedDomainsTable.name })
    .from(protectedDomainsTable)
    .where(eq(protectedDomainsTable.id, domainId))
    .limit(1);

  await db
    .delete(userDomainAccessTable)
    .where(and(eq(userDomainAccessTable.userId, targetUserId), eq(userDomainAccessTable.domainId, domainId)));

  const revokeDomainSessionsInvalidated = await markSessionsAsForceLogout(targetUserId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DOMAIN_ACCESS_REVOKED",
    targetType: "user",
    targetId: targetUserId,
    detail: { domainId, domainName: domains[0]?.name, sessionsInvalidated: revokeDomainSessionsInvalidated },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

const addDegreeSchema = z.object({
  degree: z.number().int().min(1),
  conferredOn: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

router.get("/:id/degrees", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.id);

  const degreeRows = await db
    .select()
    .from(userDegreesTable)
    .where(eq(userDegreesTable.userId, targetUserId))
    .orderBy(userDegreesTable.degree);

  const degreeDefinitionsRaw = await getConfig("degree_definitions");
  const definitions: { degree: number; name: string; abbreviation: string }[] = degreeDefinitionsRaw
    ? JSON.parse(degreeDefinitionsRaw)
    : [
        { degree: 1, name: "Entered Apprentice", abbreviation: "EA" },
        { degree: 2, name: "Fellow Craft", abbreviation: "FC" },
        { degree: 3, name: "Master Mason", abbreviation: "MM" },
      ];

  const degrees = degreeRows.map((d) => {
    const def = definitions.find((def) => def.degree === d.degree);
    return {
      id: d.id,
      degree: d.degree,
      degreeName: def?.name ?? `Degree ${d.degree}`,
      conferredOn: d.conferredOn ?? null,
      notes: d.notes ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  });

  res.json({ degrees });
});

router.post("/:id/degrees", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const result = addDegreeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { degree, conferredOn, notes } = result.data;

  const degreeDefinitionsRaw = await getConfig("degree_definitions");
  const definitions: { degree: number; name: string }[] = degreeDefinitionsRaw
    ? JSON.parse(degreeDefinitionsRaw)
    : [
        { degree: 1, name: "Entered Apprentice" },
        { degree: 2, name: "Fellow Craft" },
        { degree: 3, name: "Master Mason" },
      ];
  const def = definitions.find((d) => d.degree === degree);

  if (!def) {
    res.status(400).json({ error: "Invalid degree: not found in current degree definitions" });
    return;
  }

  await db.insert(userDegreesTable).values({
    userId: targetUserId,
    degree,
    lodgeId: lodgeId ?? undefined,
    conferredOn: conferredOn ?? null,
    notes: notes ?? null,
  });

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DEGREE_RECORDED",
    targetType: "user",
    targetId: targetUserId,
    detail: { degree, degreeName: def?.name ?? `Degree ${degree}`, conferredOn },
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ success: true });
});

router.delete("/:id/degrees/:degreeId", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.id);
  const degreeId = String(req.params.degreeId);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const existing = await db
    .select()
    .from(userDegreesTable)
    .where(and(eq(userDegreesTable.id, degreeId), eq(userDegreesTable.userId, targetUserId)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Degree record not found" });
    return;
  }

  await db.delete(userDegreesTable).where(eq(userDegreesTable.id, degreeId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DEGREE_REMOVED",
    targetType: "user",
    targetId: targetUserId,
    detail: { degreeId, degree: existing[0].degree },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

const membershipStatusSchema = z.object({
  status: z.enum(["pending", "active", "inactive", "suspended"]),
});

router.post("/fix-membership", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const affected = await db
    .update(usersTable)
    .set({ membershipStatus: "active", updatedAt: new Date() })
    .where(and(
      eq(usersTable.lodgeId, lodgeId!),
      eq(usersTable.isActive, true),
      eq(usersTable.membershipStatus, "pending"),
    ))
    .returning({ id: usersTable.id });

  const ip = getClientIp(req);
  await Promise.all(
    affected.map(async (u) => {
      const sessionsInvalidated = await markSessionsAsForceLogout(u.id);
      return writeAuditLog({
        lodgeId,
        actorId,
        action: "MEMBERSHIP_STATUS_CHANGED",
        targetType: "user",
        targetId: u.id,
        detail: { from: "pending", to: "active", source: "bulk_fix", sessionsInvalidated },
        ipAddress: ip,
      });
    }),
  );

  res.json({ fixed: affected.length });
});

router.patch("/:id/membership-status", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const result = membershipStatusSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid status", issues: result.error.issues });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id, membershipStatus: usersTable.membershipStatus })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const prevStatus = existing[0].membershipStatus;
  const newStatus = result.data.status;

  if (prevStatus === newStatus) {
    res.json({ success: true });
    return;
  }

  const statusUpdates: Partial<typeof usersTable.$inferInsert> = { membershipStatus: newStatus, updatedAt: new Date() };
  if (newStatus === "suspended") {
    statusUpdates.isActive = false;
  } else if (newStatus === "active") {
    statusUpdates.isActive = true;
    statusUpdates.failedLoginAttempts = 0;
    statusUpdates.lockedUntil = null;
  }

  await db
    .update(usersTable)
    .set(statusUpdates)
    .where(eq(usersTable.id, targetId));

  const membershipSessionsInvalidated = await markSessionsAsForceLogout(targetId);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "MEMBERSHIP_STATUS_CHANGED",
    targetType: "user",
    targetId,
    detail: { from: prevStatus, to: newStatus, sessionsInvalidated: membershipSessionsInvalidated },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

const dateOfBirthSchema = z.object({
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

router.patch("/:id/name", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const parsed = z.object({
    firstName: z.string().min(1).max(100).trim(),
    lastName: z.string().min(1).max(100).trim(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "First name and last name are required." });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { firstName, lastName } = parsed.data;
  await db
    .update(usersTable)
    .set({ firstName, lastName, updatedAt: new Date() })
    .where(eq(usersTable.id, targetId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "USER_NAME_UPDATED",
    targetType: "user",
    targetId,
    detail: {
      previousFirstName: existing[0].firstName,
      previousLastName: existing[0].lastName,
      updatedFirstName: firstName,
      updatedLastName: lastName,
    },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.patch("/:id/date-of-birth", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const parsed = dateOfBirthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD or null." });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id, dateOfBirth: usersTable.dateOfBirth })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db
    .update(usersTable)
    .set({ dateOfBirth: parsed.data.dateOfBirth, updatedAt: new Date() })
    .where(eq(usersTable.id, targetId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DOB_UPDATED",
    targetType: "user",
    targetId,
    detail: { previous: existing[0].dateOfBirth, updated: parsed.data.dateOfBirth },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
