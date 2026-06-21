/**
 * Acceptance tests for DOCUMENT-ACCESS-BUG-002:
 *   Remove Site Admin view bypass for Past Master Protected folders.
 *
 * Verifies that for past_master_protected domains:
 *   1. Past Master Ritual folder is hidden from Site Admin when View is removed from matrix.
 *   2. Direct GET /document-folders/:id returns 403 for Site Admin.
 *   3. Direct GET /document-folders/:id/documents returns 403 for Site Admin.
 *   4. PM Super Administrator still sees and can access the folder.
 *   5. Audit log records denied access attempts.
 *
 * For standard domains, Site Admin bypass continues to work normally.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  protectedDomainsTable,
  documentFoldersTable,
  folderAccessMatrixTable,
  lodgesTable,
  rolesTable,
  usersTable,
  userRolesTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/password";
import { loginAgent } from "./helpers";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = "Test-Passw0rd!xyz";

const SITE_ADMIN_EMAIL = "__dab-site-admin__@test.invalid";
const PM_SUPER_EMAIL   = "__dab-pm-super__@test.invalid";
const SITE_ADMIN_SLUG  = "dab-site-admin";
const PM_SUPER_SLUG    = "dab-pm-super";

const PM_PROTECTED_DOMAIN_SLUG = "dab-pm-protected-domain";
const STANDARD_DOMAIN_SLUG     = "dab-standard-domain";

interface DABFixtures {
  lodgeId: string;
  siteAdminId: string;
  pmSuperId: string;
  siteAdminRoleId: string;
  pmSuperRoleId: string;
  pmProtectedDomainId: string;
  standardDomainId: string;
  pmProtectedFolderId: string;
  standardFolderId: string;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function seedFixtures(): Promise<DABFixtures> {
  const [lodge] = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
  if (!lodge) throw new Error("No lodge — cannot run DOCUMENT-ACCESS-BUG-002 tests.");
  const lodgeId = lodge.id;

  await teardownFixtures();

  const hash = await hashPassword(TEST_PASSWORD);

  // Roles
  const siteAdminRoleId = crypto.randomUUID();
  const pmSuperRoleId   = crypto.randomUUID();
  await db.insert(rolesTable).values([
    { id: siteAdminRoleId, lodgeId, slug: SITE_ADMIN_SLUG, name: "DAB Test Site Admin", permissionLevel: 80 },
    { id: pmSuperRoleId,   lodgeId, slug: PM_SUPER_SLUG,   name: "DAB Test PM Super",   permissionLevel: 90 },
  ]);

  // Users
  const siteAdminId = crypto.randomUUID();
  const pmSuperId   = crypto.randomUUID();
  await db.insert(usersTable).values([
    { id: siteAdminId, lodgeId, email: SITE_ADMIN_EMAIL, firstName: "DAB", lastName: "SiteAdmin",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
    { id: pmSuperId,   lodgeId, email: PM_SUPER_EMAIL,   firstName: "DAB", lastName: "PMSuper",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
  ]);
  await db.insert(userRolesTable).values([
    { id: crypto.randomUUID(), userId: siteAdminId, roleId: siteAdminRoleId },
    { id: crypto.randomUUID(), userId: pmSuperId,   roleId: pmSuperRoleId },
  ]);

  // Domains
  const pmProtectedDomainId = crypto.randomUUID();
  const standardDomainId    = crypto.randomUUID();
  await db.insert(protectedDomainsTable).values([
    {
      id: pmProtectedDomainId,
      lodgeId,
      name: "DAB PM Protected Domain",
      slug: PM_PROTECTED_DOMAIN_SLUG,
      frame: "ritual",
      accessLogic: "role_only",
      domainProtectionLevel: "past_master_protected",
      allowedRoleSlugs: [],
    },
    {
      id: standardDomainId,
      lodgeId,
      name: "DAB Standard Domain",
      slug: STANDARD_DOMAIN_SLUG,
      frame: "general",
      accessLogic: "role_only",
      domainProtectionLevel: "standard",
      allowedRoleSlugs: [],
    },
  ]);

  // System root folders
  const pmProtectedFolderId = crypto.randomUUID();
  const standardFolderId    = crypto.randomUUID();
  await db.insert(documentFoldersTable).values([
    {
      id: pmProtectedFolderId,
      lodgeId,
      domainId: pmProtectedDomainId,
      title: "DAB PM Protected Root",
      frame: "ritual",
      isSystemRoot: true,
    },
    {
      id: standardFolderId,
      lodgeId,
      domainId: standardDomainId,
      title: "DAB Standard Root",
      frame: "general",
      isSystemRoot: true,
    },
  ]);

  // Matrix: PM Super gets View on the protected folder; Site Admin gets View on standard only
  await db.insert(folderAccessMatrixTable).values([
    // PM Protected folder — only PM Super has view
    {
      id: crypto.randomUUID(),
      lodgeId,
      folderId: pmProtectedFolderId,
      subjectType: "role",
      subjectKey: PM_SUPER_SLUG,
      permission: "view",
    },
    // Standard folder — both roles have view (to verify bypass still works for standard)
    {
      id: crypto.randomUUID(),
      lodgeId,
      folderId: standardFolderId,
      subjectType: "role",
      subjectKey: SITE_ADMIN_SLUG,
      permission: "view",
    },
    {
      id: crypto.randomUUID(),
      lodgeId,
      folderId: standardFolderId,
      subjectType: "role",
      subjectKey: PM_SUPER_SLUG,
      permission: "view",
    },
  ]);

  return {
    lodgeId,
    siteAdminId,
    pmSuperId,
    siteAdminRoleId,
    pmSuperRoleId,
    pmProtectedDomainId,
    standardDomainId,
    pmProtectedFolderId,
    standardFolderId,
  };
}

async function teardownFixtures(): Promise<void> {
  const existingDomains = await db
    .select({ id: protectedDomainsTable.id })
    .from(protectedDomainsTable)
    .where(inArray(protectedDomainsTable.slug, [PM_PROTECTED_DOMAIN_SLUG, STANDARD_DOMAIN_SLUG]));
  const domainIds = existingDomains.map((d) => d.id);

  if (domainIds.length > 0) {
    const folders = await db
      .select({ id: documentFoldersTable.id })
      .from(documentFoldersTable)
      .where(inArray(documentFoldersTable.domainId, domainIds));
    const folderIds = folders.map((f) => f.id);
    if (folderIds.length > 0) {
      await db.delete(folderAccessMatrixTable).where(inArray(folderAccessMatrixTable.folderId, folderIds));
      await db.delete(documentFoldersTable).where(inArray(documentFoldersTable.id, folderIds));
    }
    await db.delete(protectedDomainsTable).where(inArray(protectedDomainsTable.id, domainIds));
  }

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

describe("DOCUMENT-ACCESS-BUG-002: Site Admin bypass removed for past_master_protected", () => {
  let fx: DABFixtures;

  beforeAll(async () => { fx = await seedFixtures(); });
  afterAll(async () => { await teardownFixtures(); });

  // ── Folder listing ─────────────────────────────────────────────────────────

  describe("GET /api/document-folders (listing)", () => {
    it("Site Admin does NOT see a past_master_protected folder when View is removed from matrix", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get("/api/document-folders");
      expect(res.status).toBe(200);
      const ids = (res.body.folders as any[]).map((f: any) => f.id);
      expect(ids).not.toContain(fx.pmProtectedFolderId);
    });

    it("Site Admin DOES see standard domain folders (bypass still applies for standard)", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get("/api/document-folders");
      expect(res.status).toBe(200);
      const ids = (res.body.folders as any[]).map((f: any) => f.id);
      expect(ids).toContain(fx.standardFolderId);
    });

    it("PM Super sees the past_master_protected folder", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent.get("/api/document-folders");
      expect(res.status).toBe(200);
      const ids = (res.body.folders as any[]).map((f: any) => f.id);
      expect(ids).toContain(fx.pmProtectedFolderId);
    });
  });

  // ── Direct folder access ───────────────────────────────────────────────────

  describe("GET /api/document-folders/:id", () => {
    it("Site Admin gets 403 on direct access to past_master_protected folder", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get(`/api/document-folders/${fx.pmProtectedFolderId}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
    });

    it("Site Admin can access standard domain folder directly", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get(`/api/document-folders/${fx.standardFolderId}`);
      expect(res.status).toBe(200);
    });

    it("PM Super can access past_master_protected folder directly", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent.get(`/api/document-folders/${fx.pmProtectedFolderId}`);
      expect(res.status).toBe(200);
    });
  });

  // ── Document listing inside folder ─────────────────────────────────────────

  describe("GET /api/document-folders/:id/documents", () => {
    it("Site Admin gets 403 on documents listing for past_master_protected folder", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      const res = await agent.get(`/api/document-folders/${fx.pmProtectedFolderId}/documents`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
    });

    it("PM Super can list documents in past_master_protected folder", async () => {
      const agent = await loginAgent(app, PM_SUPER_EMAIL, TEST_PASSWORD);
      const res = await agent.get(`/api/document-folders/${fx.pmProtectedFolderId}/documents`);
      expect(res.status).toBe(200);
    });
  });

  // ── Audit log ──────────────────────────────────────────────────────────────

  describe("Audit log", () => {
    it("writes DOCUMENT_ACCESS_DENIED when Site Admin is denied a past_master_protected folder", async () => {
      const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
      // Trigger a denied access attempt
      await agent.get(`/api/document-folders/${fx.pmProtectedFolderId}`);

      const rows = await db
        .select({ action: auditLogsTable.action, actorEmail: auditLogsTable.actorEmail })
        .from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.actorEmail, SITE_ADMIN_EMAIL),
          eq(auditLogsTable.action, "DOCUMENT_ACCESS_DENIED"),
        ));

      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].action).toBe("DOCUMENT_ACCESS_DENIED");
    });
  });

  // ── Site Admin with View granted via matrix CAN access ─────────────────────

  describe("Matrix grants access to Site Admin when View is explicitly added", () => {
    it("Site Admin sees past_master_protected folder when View is added to matrix", async () => {
      // Grant view to Site Admin in the matrix
      await db.insert(folderAccessMatrixTable).values({
        id: crypto.randomUUID(),
        lodgeId: fx.lodgeId,
        folderId: fx.pmProtectedFolderId,
        subjectType: "role",
        subjectKey: SITE_ADMIN_SLUG,
        permission: "view",
      });

      try {
        const agent = await loginAgent(app, SITE_ADMIN_EMAIL, TEST_PASSWORD);
        const listRes = await agent.get("/api/document-folders");
        expect(listRes.status).toBe(200);
        const ids = (listRes.body.folders as any[]).map((f: any) => f.id);
        expect(ids).toContain(fx.pmProtectedFolderId);

        const detailRes = await agent.get(`/api/document-folders/${fx.pmProtectedFolderId}`);
        expect(detailRes.status).toBe(200);
      } finally {
        // Restore: remove the granted row
        await db.delete(folderAccessMatrixTable).where(and(
          eq(folderAccessMatrixTable.folderId, fx.pmProtectedFolderId),
          eq(folderAccessMatrixTable.subjectKey, SITE_ADMIN_SLUG),
          eq(folderAccessMatrixTable.permission, "view"),
        ));
      }
    });
  });
});
