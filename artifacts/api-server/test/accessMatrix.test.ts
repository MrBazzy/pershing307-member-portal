/**
 * Integration tests for the access-matrix admin endpoints:
 *   GET  /api/document-domains/:id/access-matrix
 *   PUT  /api/document-domains/:id/access-matrix
 *
 * These tests also verify that a matrix change actually affects:
 *   - GET /api/document-folders (root list visibility)
 *   - GET /api/document-folders/:id/documents (document list access)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  protectedDomainsTable,
  documentFoldersTable,
  documentsTable,
  folderAccessMatrixTable,
  lodgesTable,
  rolesTable,
  usersTable,
  userRolesTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import app from "../src/app";
import { hashPassword } from "../src/lib/password";
import { loginAgent } from "./helpers";
import { replaceMatrixForFolder } from "../src/lib/matrixPermissions";

// ── Fixture constants ─────────────────────────────────────────────────────────

const MAT_ADMIN_EMAIL  = "__mat_test_admin__@test.invalid";
const MAT_MEMBER_EMAIL = "__mat_test_member__@test.invalid";
const MAT_ADMIN_SLUG   = "__mat_test_admin__";
const MAT_MEMBER_SLUG  = "__mat_test_member__";
const TEST_PASSWORD    = "Test-Passw0rd!xyz";

interface MatrixFixtures {
  lodgeId: string;
  adminEmail: string;
  memberEmail: string;
  password: string;
  adminUserId: string;
  memberUserId: string;
  userIds: string[];
  roleIds: string[];
  /** ID of the "general-documents" domain (may be pre-existing). */
  generalDomainId: string;
  /** ID of the root folder linked to general-documents. */
  generalFolderId: string;
  /** Original matrix rows snapshot (restored in afterAll). */
  originalMatrix: Array<{ subjectType: string; subjectKey: string; permission: string }>;
}

async function seedMatrixFixtures(): Promise<MatrixFixtures> {
  const [lodge] = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
  if (!lodge) throw new Error("No lodge configured — cannot run access-matrix tests.");
  const lodgeId = lodge.id;

  const hash = await hashPassword(TEST_PASSWORD);

  const adminRoleId  = crypto.randomUUID();
  const memberRoleId = crypto.randomUUID();
  await db.insert(rolesTable).values([
    { id: adminRoleId,  lodgeId, slug: MAT_ADMIN_SLUG,  name: "Matrix Test Admin",  permissionLevel: 90 },
    { id: memberRoleId, lodgeId, slug: MAT_MEMBER_SLUG, name: "Matrix Test Member", permissionLevel: 25 },
  ]);

  const adminUserId  = crypto.randomUUID();
  const memberUserId = crypto.randomUUID();
  await db.insert(usersTable).values([
    { id: adminUserId,  lodgeId, email: MAT_ADMIN_EMAIL,  firstName: "Matrix", lastName: "Admin",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
    { id: memberUserId, lodgeId, email: MAT_MEMBER_EMAIL, firstName: "Matrix", lastName: "Member",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
  ]);
  await db.insert(userRolesTable).values([
    { id: crypto.randomUUID(), userId: adminUserId,  roleId: adminRoleId  },
    { id: crypto.randomUUID(), userId: memberUserId, roleId: memberRoleId },
  ]);

  // Trigger domain + matrix seeding by calling GET /document-folders as admin
  const adminAgent = request.agent(app);
  const loginRes = await adminAgent.post("/api/auth/login").send({ email: MAT_ADMIN_EMAIL, password: TEST_PASSWORD });
  if (loginRes.status !== 200) throw new Error(`Admin login failed: ${loginRes.status}`);
  await adminAgent.get("/api/document-folders");

  // Find the general-documents domain
  const domain = await db
    .select({ id: protectedDomainsTable.id })
    .from(protectedDomainsTable)
    .where(eq(protectedDomainsTable.slug, "general-documents"))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!domain) throw new Error("general-documents domain not found after seeding.");

  const folder = await db
    .select({ id: documentFoldersTable.id })
    .from(documentFoldersTable)
    .where(and(
      eq(documentFoldersTable.domainId, domain.id),
      eq(documentFoldersTable.isSystemRoot, true),
    ))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!folder) throw new Error("general-documents root folder not found after seeding.");

  // Snapshot original matrix so we can restore it in teardown
  const rows = await db
    .select({
      subjectType: folderAccessMatrixTable.subjectType,
      subjectKey: folderAccessMatrixTable.subjectKey,
      permission: folderAccessMatrixTable.permission,
    })
    .from(folderAccessMatrixTable)
    .where(eq(folderAccessMatrixTable.folderId, folder.id));

  return {
    lodgeId,
    adminEmail: MAT_ADMIN_EMAIL,
    memberEmail: MAT_MEMBER_EMAIL,
    password: TEST_PASSWORD,
    adminUserId,
    memberUserId,
    userIds: [adminUserId, memberUserId],
    roleIds: [adminRoleId, memberRoleId],
    generalDomainId: domain.id,
    generalFolderId: folder.id,
    originalMatrix: rows,
  };
}

async function teardownMatrixFixtures(fx: MatrixFixtures): Promise<void> {
  // Restore original matrix
  if (fx.originalMatrix.length > 0) {
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  }

  await db.delete(auditLogsTable).where(
    inArray(auditLogsTable.actorEmail, [MAT_ADMIN_EMAIL, MAT_MEMBER_EMAIL]),
  );
  if (fx.userIds.length > 0) {
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorId, fx.userIds));
    for (const uid of fx.userIds) {
      try {
        const { pool } = await import("@workspace/db");
        await pool.query("DELETE FROM sessions WHERE sess::text LIKE $1", [`%${uid}%`]);
      } catch { /* ignore */ }
    }
    await db.delete(userRolesTable).where(inArray(userRolesTable.userId, fx.userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, fx.userIds));
  }
  if (fx.roleIds.length > 0) {
    await db.delete(rolesTable).where(inArray(rolesTable.id, fx.roleIds));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/document-domains/:id/access-matrix", () => {
  let fx: MatrixFixtures;

  beforeAll(async () => { fx = await seedMatrixFixtures(); });
  afterAll(async () => { await teardownMatrixFixtures(fx); });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get(`/api/document-domains/${fx.generalDomainId}/access-matrix`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin member", async () => {
    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent.get(`/api/document-domains/${fx.generalDomainId}/access-matrix`);
    expect(res.status).toBe(403);
  });

  it("returns 200 with matrix rows for an admin", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const res = await agent.get(`/api/document-domains/${fx.generalDomainId}/access-matrix`);
    expect(res.status).toBe(200);
    expect(res.body.domainId).toBe(fx.generalDomainId);
    expect(res.body.folderId).toBe(fx.generalFolderId);
    expect(Array.isArray(res.body.matrix)).toBe(true);
    expect(res.body.matrix.length).toBeGreaterThan(0);
  });

  it("returned matrix rows have the required shape", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const res = await agent.get(`/api/document-domains/${fx.generalDomainId}/access-matrix`);
    expect(res.status).toBe(200);
    for (const row of res.body.matrix) {
      expect(row).toHaveProperty("id");
      expect(["role", "degree"]).toContain(row.subjectType);
      expect(typeof row.subjectKey).toBe("string");
      expect(["view", "upload", "approve", "manage"]).toContain(row.permission);
    }
  });

  it("returns 404 for an unknown domain ID", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const res = await agent.get("/api/document-domains/nonexistent-domain-id/access-matrix");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/document-domains/:id/access-matrix", () => {
  let fx: MatrixFixtures;

  beforeAll(async () => { fx = await seedMatrixFixtures(); });
  afterAll(async () => { await teardownMatrixFixtures(fx); });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .put(`/api/document-domains/${fx.generalDomainId}/access-matrix`)
      .send({ matrix: [] });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin member", async () => {
    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent
      .put(`/api/document-domains/${fx.generalDomainId}/access-matrix`)
      .send({ matrix: [] });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid payload", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const res = await agent
      .put(`/api/document-domains/${fx.generalDomainId}/access-matrix`)
      .send({ matrix: [{ subjectType: "bad-type", subjectKey: "x", permission: "view" }] });
    expect(res.status).toBe(400);
  });

  it("returns 200 and updates the matrix", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const newMatrix = [
      { subjectType: "role", subjectKey: "secretary", permission: "view" },
      { subjectType: "role", subjectKey: "secretary", permission: "upload" },
    ];

    const res = await agent
      .put(`/api/document-domains/${fx.generalDomainId}/access-matrix`)
      .send({ matrix: newMatrix });

    expect(res.status).toBe(200);
    expect(res.body.domainId).toBe(fx.generalDomainId);
    expect(res.body.folderId).toBe(fx.generalFolderId);
    expect(res.body.matrix.length).toBe(2);

    const keys = res.body.matrix.map((r: any) => `${r.subjectType}:${r.subjectKey}:${r.permission}`);
    expect(keys).toContain("role:secretary:view");
    expect(keys).toContain("role:secretary:upload");

    // Restore original matrix for subsequent tests
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });

  it("accepts an empty matrix (clears all permissions)", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const res = await agent
      .put(`/api/document-domains/${fx.generalDomainId}/access-matrix`)
      .send({ matrix: [] });
    expect(res.status).toBe(200);
    expect(res.body.matrix).toEqual([]);

    // Restore
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });

  it("returns 404 for an unknown domain ID", async () => {
    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    const res = await agent
      .put("/api/document-domains/nonexistent-domain-id/access-matrix")
      .send({ matrix: [] });
    expect(res.status).toBe(404);
  });
});

describe("Matrix enforcement — GET /api/documents, download, view", () => {
  let fx: MatrixFixtures;
  let testDocId: string;

  beforeAll(async () => {
    fx = await seedMatrixFixtures();
    // Insert a published document in general-documents folder so we can test
    // the document-level routes without needing real object storage.
    const [inserted] = await db
      .insert(documentsTable)
      .values({
        lodgeId: fx.lodgeId,
        folderId: fx.generalFolderId,
        uploaderId: fx.memberUserId,
        title: "__mat_test__ published doc",
        originalFileName: "test-doc.pdf",
        mimeType: "application/pdf",
        fileSize: 0,
        storagePath: "fake/path/test-doc.pdf",
        status: "published",
      })
      .returning({ id: documentsTable.id });
    testDocId = inserted.id;
  });

  afterAll(async () => {
    if (testDocId) {
      await db.delete(documentsTable).where(eq(documentsTable.id, testDocId));
    }
    await teardownMatrixFixtures(fx);
  });

  it("returns 403 on GET /documents?folderId= when member lacks matrix view access", async () => {
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, [
      { subjectType: "role", subjectKey: "secretary", permission: "view" },
    ]);

    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent.get(`/api/documents?folderId=${fx.generalFolderId}`);
    expect(res.status).toBe(403);

    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });

  it("returns 403 on GET /documents/:id/download when member lacks matrix view access", async () => {
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, [
      { subjectType: "role", subjectKey: "secretary", permission: "view" },
    ]);

    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent.get(`/api/documents/${testDocId}/download`);
    expect(res.status).toBe(403);

    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });

  it("returns 403 on GET /documents/:id/view when member lacks matrix view access", async () => {
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, [
      { subjectType: "role", subjectKey: "secretary", permission: "view" },
    ]);

    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent.get(`/api/documents/${testDocId}/view`);
    expect(res.status).toBe(403);

    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });

  it("admin bypasses matrix and can still download/view", async () => {
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, [
      { subjectType: "role", subjectKey: "secretary", permission: "view" },
    ]);

    const agent = await loginAgent(app, fx.adminEmail, fx.password);
    // Admin should NOT get 403 — they bypass the matrix gate entirely.
    // The call will fail later (storage path is fake) but not with 403.
    const dl = await agent.get(`/api/documents/${testDocId}/download`);
    expect(dl.status).not.toBe(403);

    const vw = await agent.get(`/api/documents/${testDocId}/view`);
    expect(vw.status).not.toBe(403);

    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });
});

describe("Matrix enforcement — GET /api/document-folders", () => {
  let fx: MatrixFixtures;

  beforeAll(async () => { fx = await seedMatrixFixtures(); });
  afterAll(async () => { await teardownMatrixFixtures(fx); });

  it("hides general-documents from member when view access is restricted to a role they lack", async () => {
    // Replace with secretary-only view; the test member has no secretary role
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, [
      { subjectType: "role", subjectKey: "secretary", permission: "view" },
      { subjectType: "role", subjectKey: "secretary", permission: "upload" },
    ]);

    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent.get("/api/document-folders");
    expect(res.status).toBe(200);
    const generalFolder = (res.body.folders as any[]).find(
      (f: any) => f.domainSlug === "general-documents",
    );
    expect(generalFolder).toBeUndefined();

    // Restore
    await replaceMatrixForFolder(fx.generalFolderId, fx.lodgeId, fx.originalMatrix as any);
  });

  it("shows general-documents to member when view row is present", async () => {
    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent.get("/api/document-folders");
    expect(res.status).toBe(200);
    const generalFolder = (res.body.folders as any[]).find(
      (f: any) => f.domainSlug === "general-documents",
    );
    expect(generalFolder).toBeDefined();
  });
});
