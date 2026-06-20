import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  userRolesTable,
  rolesTable,
  userDegreesTable,
  protectedDomainsTable,
  documentFoldersTable,
  userDomainAccessTable,
  userDocumentNoticeAcceptanceTable,
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

  const [degreeRows, noticeRows] = await Promise.all([
    db
      .select({
        userId: userDegreesTable.userId,
        degree: userDegreesTable.degree,
        conferredOn: userDegreesTable.conferredOn,
        notes: userDegreesTable.notes,
      })
      .from(userDegreesTable)
      .where(inArray(userDegreesTable.userId, userIds))
      .orderBy(userDegreesTable.degree),
    db
      .select({
        userId: userDocumentNoticeAcceptanceTable.userId,
        acceptedAt: userDocumentNoticeAcceptanceTable.acceptedAt,
      })
      .from(userDocumentNoticeAcceptanceTable)
      .where(inArray(userDocumentNoticeAcceptanceTable.userId, userIds)),
  ]);

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

  const noticeMap = new Map<string, Date>();
  for (const n of noticeRows) {
    if (!noticeMap.has(n.userId)) noticeMap.set(n.userId, n.acceptedAt);
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
    noticeAcceptedAt: noticeMap.get(u.id)?.toISOString() ?? null,
    roles: (rolesMap.get(u.id) ?? [])
      .map((r) => ({ slug: r.slug, name: r.name, permissionLevel: r.permissionLevel }))
      .sort((a, b) => b.permissionLevel - a.permissionLevel),
    degrees: (degreesMap.get(u.id) ?? [])
      .map((d) => ({ degree: d.degree, conferredOn: d.conferredOn ?? null, notes: d.notes ?? null }))
      .sort((a, b) => a.degree - b.degree),
  }));

  res.json({ members });
});

// ── GET /reports/document-access ─────────────────────────────────────────────
router.get("/document-access", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) { res.status(500).json({ error: "Lodge not configured" }); return; }

  const domains = await db
    .select()
    .from(protectedDomainsTable)
    .where(eq(protectedDomainsTable.lodgeId, lodgeId))
    .orderBy(protectedDomainsTable.name);

  if (domains.length === 0) {
    res.json({ domains: [] });
    return;
  }

  const domainIds = domains.map((d) => d.id);

  const folderRows = await db
    .select({ domainId: documentFoldersTable.domainId, id: documentFoldersTable.id })
    .from(documentFoldersTable)
    .where(inArray(documentFoldersTable.domainId, domainIds));

  const folderCountMap = new Map<string, number>();
  for (const f of folderRows) {
    if (f.domainId) folderCountMap.set(f.domainId, (folderCountMap.get(f.domainId) ?? 0) + 1);
  }

  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.lodgeId, lodgeId));

  if (users.length === 0) {
    res.json({ domains: domains.map((d) => ({ id: d.id, name: d.name, slug: d.slug, frame: d.frame, accessLogic: d.accessLogic, allowedRoleSlugs: (d.allowedRoleSlugs ?? []) as string[], minDegree: d.minDegree ?? null, folderCount: 0, members: [] })) });
    return;
  }

  const userIds = users.map((u) => u.id);

  const roleRows = await db
    .select({ userId: userRolesTable.userId, slug: rolesTable.slug })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(inArray(userRolesTable.userId, userIds));

  const userRoleSlugsMap = new Map<string, Set<string>>();
  for (const r of roleRows) {
    if (!userRoleSlugsMap.has(r.userId)) userRoleSlugsMap.set(r.userId, new Set());
    userRoleSlugsMap.get(r.userId)!.add(r.slug);
  }

  const degreeRows = await db
    .select({ userId: userDegreesTable.userId, degree: userDegreesTable.degree })
    .from(userDegreesTable)
    .where(inArray(userDegreesTable.userId, userIds));

  const userMaxDegreeMap = new Map<string, number>();
  for (const d of degreeRows) {
    const cur = userMaxDegreeMap.get(d.userId) ?? 0;
    if (d.degree > cur) userMaxDegreeMap.set(d.userId, d.degree);
  }

  const grantRows = await db
    .select({ userId: userDomainAccessTable.userId, domainId: userDomainAccessTable.domainId })
    .from(userDomainAccessTable)
    .where(inArray(userDomainAccessTable.userId, userIds));

  const explicitGrantsMap = new Map<string, Set<string>>();
  for (const g of grantRows) {
    if (!explicitGrantsMap.has(g.domainId)) explicitGrantsMap.set(g.domainId, new Set());
    explicitGrantsMap.get(g.domainId)!.add(g.userId);
  }

  const result = domains.map((domain) => {
    const allowedSlugs: string[] = (domain.allowedRoleSlugs ?? []) as string[];
    const minDeg = domain.minDegree ?? 0;
    const logic = domain.accessLogic as string;

    const members: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      accessReason: string;
    }[] = [];

    for (const user of users) {
      const roleSlugs = userRoleSlugsMap.get(user.id) ?? new Set<string>();
      const maxDeg = userMaxDegreeMap.get(user.id) ?? 0;
      const hasRole = allowedSlugs.length > 0 && allowedSlugs.some((s) => roleSlugs.has(s));
      const hasDeg = minDeg > 0 && maxDeg >= minDeg;
      const isExplicit = explicitGrantsMap.get(domain.id)?.has(user.id) ?? false;

      let accessReason: string | null = null;

      if (isExplicit) {
        accessReason = "Explicit grant";
      } else if (logic === "role_only" && hasRole) {
        accessReason = "Role";
      } else if (logic === "degree_only" && hasDeg) {
        accessReason = "Degree";
      } else if (logic === "role_or_degree") {
        if (hasRole && hasDeg) accessReason = "Role + Degree";
        else if (hasRole) accessReason = "Role";
        else if (hasDeg) accessReason = "Degree";
      } else if (logic === "role_and_degree" && hasRole && hasDeg) {
        accessReason = "Role + Degree";
      }

      if (accessReason !== null) {
        members.push({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          accessReason,
        });
      }
    }

    members.sort(
      (a, b) =>
        (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
        (a.firstName ?? "").localeCompare(b.firstName ?? ""),
    );

    return {
      id: domain.id,
      name: domain.name,
      slug: domain.slug,
      frame: domain.frame,
      accessLogic: logic,
      allowedRoleSlugs: allowedSlugs,
      minDegree: domain.minDegree ?? null,
      folderCount: folderCountMap.get(domain.id) ?? 0,
      members,
    };
  });

  res.json({ domains: result });
});

export default router;
