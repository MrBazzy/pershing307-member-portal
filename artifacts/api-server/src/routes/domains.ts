import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { protectedDomainsTable, userDomainAccessTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";

const router = Router();

const ADMINISTRATOR_LEVEL = 70;
const PM_SUPER_ADMIN_LEVEL = 90;

router.get("/", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const domains = await db
    .select({
      id: protectedDomainsTable.id,
      name: protectedDomainsTable.name,
      slug: protectedDomainsTable.slug,
      description: protectedDomainsTable.description,
    })
    .from(protectedDomainsTable)
    .where(eq(protectedDomainsTable.lodgeId, lodgeId))
    .orderBy(protectedDomainsTable.name);

  res.json({ domains });
});

router.get("/:domainId/members", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const domainId = String(req.params.domainId);
  const lodgeId = await getLodgeId();

  const domain = await db
    .select({ id: protectedDomainsTable.id, name: protectedDomainsTable.name })
    .from(protectedDomainsTable)
    .where(and(eq(protectedDomainsTable.id, domainId), eq(protectedDomainsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (domain.length === 0) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const grants = await db
    .select({
      userId: userDomainAccessTable.userId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      grantedAt: userDomainAccessTable.grantedAt,
    })
    .from(userDomainAccessTable)
    .innerJoin(usersTable, eq(userDomainAccessTable.userId, usersTable.id))
    .where(eq(userDomainAccessTable.domainId, domainId));

  res.json({ users: grants.map((g) => ({ ...g, grantedAt: g.grantedAt.toISOString() })) });
});

router.get("/:userId", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.userId);

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

const grantSchema = z.object({ domainId: z.string().min(1) });

router.post("/:userId", requireAuth(), requireRole(PM_SUPER_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.userId);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const result = grantSchema.safeParse(req.body);
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

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DOMAIN_ACCESS_GRANTED",
    targetType: "user",
    targetId: targetUserId,
    detail: { domainId, domainName: domains[0].name },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.delete("/:userId/:domainId", requireAuth(), requireRole(PM_SUPER_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.userId);
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

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DOMAIN_ACCESS_REVOKED",
    targetType: "user",
    targetId: targetUserId,
    detail: { domainId, domainName: domains[0]?.name },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
