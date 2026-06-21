/**
 * Integration tests for DOMAIN-GOVERNANCE-001:
 *   domainProtectionLevel field on protected domains.
 *
 * Verifies:
 *   - Site Admins (level 80) are blocked from modifying past_master_protected domains
 *   - PM Super Admins (level 90) can modify any domain regardless of protection level
 *   - Audit log entry written on blocked Site Admin attempt
 *   - Site Admins CAN modify standard domains normally
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  protectedDomainsTable,
  documentFoldersTable,
  lodgesTable,
  rolesTable,
  usersTable,
  userRolesTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/password";
import { loginAgent } from "./helpers";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = "Test-Passw0rd!xyz";

const SITE_ADMIN_EMAIL = "__dp-site-admin__@test.invalid";
const PM_SUPER_EMAIL   = "__dp-pm-super__@test.invalid";
const SITE_ADMIN_SLUG  = "dp-test-site-admin";
const PM_SUPER_SLUG    = "dp-test-pm-super";

const PROTECTED_DOMAIN_SLUG = "dp-test-protected-domain";
const STANDARD_DOMAIN_SLUG  = "dp-test-standard-domain";

interface DPFixtures {
  lodgeId: string;
  siteAdminId: string;
  pmSuperId: string;
  protectedDomainId: string;
  standardDomainId: string;
  protectedRootFolderId: string;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seedFixtures(): Promise<DPFixtures> {
  const [lodge] = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
  if (!lodge) throw new Error("No lodge configured — cannot run domain protection tests.");
  const lodgeId = lodge.id;

  await teardownFixtures();

  const hash = await hashPassword(TEST_PASSWORD);

  // Roles
  const siteAdminRoleId = crypto.randomUUID();
  const pmSuperRoleId   = crypto.randomUUID();
  await db.insert(rolesTable).values([
    { id: siteAdminRoleId, lodgeId, slug: SITE_ADMIN_SLUG, name: "DP Test Site Admin", permissionLevel: 80 },
    { id: pmSuperRoleId,   lodgeId, slug: PM_SUPER_SLUG,   name: "DP Test PM Super",   permissionLevel: 90 },
  ]);

  // Users
  const siteAdminId = crypto.randomUUID();
  const pmSuperId   = crypto.randomUUID();
  await db.insert(usersTable).values([
    { id: siteAdminId, lodgeId, email: SITE_ADMIN_EMAIL, firstName: "DP", lastName: "SiteAdmin",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
    { id: pmSuperId,   lodgeId, email: PM_SUPER_EMAIL,   firstName: "DP", lastName: "PMSuper",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
  ]);
  await db.insert(userRolesTable).values([
    { id: crypto.randomUUID(), userId: siteAdminId, roleId: siteAdminRoleId },
    { id: crypto.randomUUID(), userId: pmSuperId,   roleId: pmSuperRoleId },
  ]);

  // Domains
  const protectedDomainId = crypto.randomUUID();
  const standardDomainId  = crypto.randomUUID();
  await db.insert(protectedDomainsTable).values([
    {
      id: protectedDomainId,
      lodgeId,
      name: "DP Test Protected Domain",
      slug: PROTECTED_DOMAIN_SLUG,
      frame: "general",
      accessLogic: "role_only",
      domainProtectionLevel: "past_master_protected",
      allowedRoleSlugs: [],
    },
    {
      id: standardDomainId,
      lodgeId,
      name: "DP Test Standard Domain",
      slug: STANDARD_DOMAIN_SLUG,
      frame: "general",
      accessLogic: "role_only",
      domainProtectionLevel: "standard",
      allowedRoleSlugs: [],
    },
  ]);

  // System root folder for protected domain (needed for access-matrix routes)
  const protectedRootFolderId = crypto.randomUUID();
  await db.insert(documentFoldersTable).values({
    id: protectedRootFolderId,
    lodgeId,
    domainId: protectedDomainId,
    title: "Root",
    frame: "general",
    isSystemRoot: true,
  });

  return { lodgeId, siteAdminId, pmSuperId, protectedDomainId, standardDomainId, protectedRootFolderId };
}

async function teardownFixtures(): Promise<void> {
  // Folders must go before domains (FK)
  const existingDomains = await db
    .select({ id: protectedDomainsTable.id })
    .from(protectedDomainsTable)
    .where(inArray(protectedDomainsTable.slug, [PROTECTED_DOMAIN_SLUG, STANDARD_DOMAIN_SLUG, "dp-sa-created", "dp-pms-created"]));
  const domainIds = existingDomains.map((d) => d.id);
  if (domainIds.length > 0) {
    await db.delete(documentFoldersTable).where(inArray(documentFoldersTable.domainId, domainIds));
    await db.delete(protectedDomainsTable).where(inArray(protectedDomainsTable.id, domainIds));
  }

  // Users
  const existingUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.email, [SITE_ADMIN_EMAIL, PM_SUPER_EMAIL]));
  const userIds = existingUsers.map((u) => u.id);
  if (userIds.length > 0) {
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorId, userIds));
    await db.delete(userRolesTable).where(inArray(userRolesTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  await db.delete(auditLogsTable)
    .where(inArray(auditLogsTable.actorEmail, [SITE_ADMIN_EMAIL, PM_SUPER_EMAIL]));
  await db.delete(rolesTable)
    .where(inArray(rolesTable.slug, [SITE_ADMIN_SLUG, PM_SUPER_SLUG]));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Domain Protection (DOMAIN-GOVERNANCE-001)", () => {
  let fx: DPFixtures;

  beforeAll(async () => { fx = await seedFixtures(); });
  afterAll(async () => { await teardownFixtures(); });

  // ── GET — both levels can read ─────────────────────────────────────────────

  describe("GET /api/document-domains (list)", () => {
    it("Site Admin can list domains and sees domainProtectionLevel", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get("/api/document-domains");
      expect(res.status).toBe(200);
      const protected_ = (res.body.domains as any[]).find((d: any) => d.id === fx.protectedDomainId);
      expect(protected_).toBeDefined();
      expect(protected_.domainProtectionLevel).toBe("past_master_protected");
    });

    it("PM Super can list domains and sees domainProtectionLevel", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent.get("/api/document-domains");
      expect(res.status).toBe(200);
      const protected_ = (res.body.domains as any[]).find((d: any) => d.id === fx.protectedDomainId);
      expect(protected_).toBeDefined();
      expect(protected_.domainProtectionLevel).toBe("past_master_protected");
    });
  });

  describe("GET /api/document-domains/:id", () => {
    it("Site Admin can view a past_master_protected domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get(`/api/document-domains/${fx.protectedDomainId}`);
      expect(res.status).toBe(200);
      expect(res.body.domain.domainProtectionLevel).toBe("past_master_protected");
    });
  });

  // ── PATCH — name/description/protection level ──────────────────────────────

  describe("PATCH /api/document-domains/:id", () => {
    it("Site Admin is blocked (403) from patching a past_master_protected domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent
        .patch(`/api/document-domains/${fx.protectedDomainId}`)
        .send({ name: "Hacked Name" });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
    });

    it("Site Admin CAN patch a standard domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent
        .patch(`/api/document-domains/${fx.standardDomainId}`)
        .send({ name: "DP Test Standard Domain (updated)" });
      expect(res.status).toBe(200);
      expect(res.body.domain.name).toBe("DP Test Standard Domain (updated)");
    });

    it("PM Super CAN patch a past_master_protected domain", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent
        .patch(`/api/document-domains/${fx.protectedDomainId}`)
        .send({ name: "DP Test Protected Domain (pm updated)" });
      expect(res.status).toBe(200);
      expect(res.body.domain.domainProtectionLevel).toBe("past_master_protected");
    });

    it("Site Admin is blocked from escalating a standard domain to past_master_protected", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent
        .patch(`/api/document-domains/${fx.standardDomainId}`)
        .send({ domainProtectionLevel: "past_master_protected" });
      expect(res.status).toBe(403);
    });

    it("PM Super can toggle domainProtectionLevel on a domain", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const flipRes = await agent
        .patch(`/api/document-domains/${fx.standardDomainId}`)
        .send({ domainProtectionLevel: "past_master_protected" });
      expect(flipRes.status).toBe(200);
      expect(flipRes.body.domain.domainProtectionLevel).toBe("past_master_protected");

      const restoreRes = await agent
        .patch(`/api/document-domains/${fx.standardDomainId}`)
        .send({ domainProtectionLevel: "standard" });
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.domain.domainProtectionLevel).toBe("standard");
    });
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  describe("DELETE /api/document-domains/:id", () => {
    it("Site Admin is blocked (403) from deleting a past_master_protected domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.delete(`/api/document-domains/${fx.protectedDomainId}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
    });

    it("PM Super CAN delete a standard domain", async () => {
      const [lodge] = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
      const throwawayId = crypto.randomUUID();
      await db.insert(protectedDomainsTable).values({
        id: throwawayId,
        lodgeId: lodge!.id,
        name: "DP Throwaway",
        slug: "dp-throwaway",
        frame: "general",
        accessLogic: "role_only",
        domainProtectionLevel: "standard",
        allowedRoleSlugs: [],
      });
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent.delete(`/api/document-domains/${throwawayId}`);
      expect(res.status).toBe(200);
    });
  });

  // ── Access-matrix PUT ──────────────────────────────────────────────────────

  describe("PUT /api/document-domains/:id/access-matrix", () => {
    it("Site Admin is blocked (403) from updating access matrix of a past_master_protected domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent
        .put(`/api/document-domains/${fx.protectedDomainId}/access-matrix`)
        .send({ matrix: [] });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
    });

    it("PM Super CAN update access matrix of a past_master_protected domain", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent
        .put(`/api/document-domains/${fx.protectedDomainId}/access-matrix`)
        .send({ matrix: [] });
      expect(res.status).toBe(200);
    });
  });

  // ── Audit log on blocked attempt ───────────────────────────────────────────

  describe("Audit log", () => {
    it("writes a DOMAIN_PROTECTION_BLOCKED audit entry when Site Admin is blocked", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      await agent
        .patch(`/api/document-domains/${fx.protectedDomainId}`)
        .send({ name: "Blocked attempt" });

      const rows = await db
        .select({ action: auditLogsTable.action, actorEmail: auditLogsTable.actorEmail })
        .from(auditLogsTable)
        .where(eq(auditLogsTable.actorEmail, SITE_ADMIN_EMAIL));

      const blocked = rows.find((r) => r.action === "DOMAIN_PROTECTION_BLOCKED");
      expect(blocked).toBeDefined();
    });
  });

  // ── POST create ────────────────────────────────────────────────────────────

  describe("POST /api/document-domains (create)", () => {
    it("Site Admin is blocked from creating a past_master_protected domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent
        .post("/api/document-domains")
        .send({
          name: "Sneaky Protected Domain",
          slug: "dp-sneaky",
          accessLogic: "role_only",
          domainProtectionLevel: "past_master_protected",
        });
      expect(res.status).toBe(403);
    });

    it("Site Admin CAN create a standard domain", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent
        .post("/api/document-domains")
        .send({
          name: "DP Site Admin Created",
          slug: "dp-sa-created",
          accessLogic: "role_only",
          domainProtectionLevel: "standard",
        });
      expect(res.status).toBe(201);
      if (res.body.domain?.id) {
        await db.delete(protectedDomainsTable).where(eq(protectedDomainsTable.id, res.body.domain.id));
      }
    });

    it("PM Super CAN create a past_master_protected domain", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent
        .post("/api/document-domains")
        .send({
          name: "DP PM Super Protected",
          slug: "dp-pms-created",
          accessLogic: "role_only",
          domainProtectionLevel: "past_master_protected",
        });
      expect(res.status).toBe(201);
      expect(res.body.domain.domainProtectionLevel).toBe("past_master_protected");
      if (res.body.domain?.id) {
        await db.delete(protectedDomainsTable).where(eq(protectedDomainsTable.id, res.body.domain.id));
      }
    });
  });
});
