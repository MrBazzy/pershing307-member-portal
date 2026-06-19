/**
 * Integration tests for POST /api/documents/request-upload
 *
 * These tests guard the canUploadToFolder permission gate in the route:
 *   - Members restricted to General Documents domain only
 *   - Admins can upload anywhere
 *
 * Object storage is NOT required — blocked requests are rejected before the
 * storage call, and allowed requests are verified by the *absence* of the
 * upload-rights 403, not by a full 200 response.
 *
 * We seed our own "full member" user (permissionLevel 25) so the route's
 * early "Members only" gate (level < 20) doesn't mask the canUploadToFolder
 * check we are here to test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "@workspace/db";
import {
  documentFoldersTable,
  documentsTable,
  protectedDomainsTable,
  lodgesTable,
  rolesTable,
  usersTable,
  userRolesTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import app from "../src/app";
import { loginAgent } from "./helpers";
import { hashPassword } from "../src/lib/password";

// ── Local fixture constants ────────────────────────────────────────────────

const UPLOAD_MEMBER_EMAIL = "__upload_test_member__@test.invalid";
const UPLOAD_ADMIN_EMAIL  = "__upload_test_admin__@test.invalid";
const UPLOAD_MEMBER_SLUG  = "__upload_test_member__";
const UPLOAD_ADMIN_SLUG   = "__upload_test_admin__";
const TEST_PASSWORD = "Test-Passw0rd!xyz";

// Slugs used only to test that members are BLOCKED from these domains.
// We use unique __uptest__ slugs so they can never be confused with production
// general-documents (canUploadToFolder keys on the exact slug).
const BLOCKED_SLUGS = [
  "meeting-minutes",
  "secretary-documents",
  "treasury-documents",
  "wm-documents",
] as const;

type BlockedSlug = (typeof BLOCKED_SLUGS)[number];
type DomainSlug = BlockedSlug | "general-documents";

interface UploadFixtures {
  lodgeId: string;
  memberEmail: string;
  adminEmail: string;
  password: string;
  userIds: string[];
  roleIds: string[];
  domainIds: Record<DomainSlug, string>;
  /** IDs of domains we actually inserted (not pre-existing ones we reused). */
  createdDomainIds: string[];
  folderIds: Record<DomainSlug | "ritual-no-domain", string>;
}

// ── Seed helpers ───────────────────────────────────────────────────────────

async function seedAll(): Promise<UploadFixtures> {
  const [lodge] = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
  if (!lodge) throw new Error("No lodge configured — cannot run upload permission tests.");
  const lodgeId = lodge.id;

  const hash = await hashPassword(TEST_PASSWORD);

  // Roles: member at 25 (passes the ≥20 gate), admin at 90
  const memberRoleId = crypto.randomUUID();
  const adminRoleId  = crypto.randomUUID();
  await db.insert(rolesTable).values([
    { id: memberRoleId, lodgeId, slug: UPLOAD_MEMBER_SLUG, name: "Upload Test Member", permissionLevel: 25 },
    { id: adminRoleId,  lodgeId, slug: UPLOAD_ADMIN_SLUG,  name: "Upload Test Admin",  permissionLevel: 90 },
  ]);

  const memberUserId = crypto.randomUUID();
  const adminUserId  = crypto.randomUUID();
  await db.insert(usersTable).values([
    { id: memberUserId, lodgeId, email: UPLOAD_MEMBER_EMAIL, firstName: "Upload", lastName: "Member",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
    { id: adminUserId,  lodgeId, email: UPLOAD_ADMIN_EMAIL,  firstName: "Upload", lastName: "Admin",
      passwordHash: hash, isActive: true, membershipStatus: "active" },
  ]);

  await db.insert(userRolesTable).values([
    { id: crypto.randomUUID(), userId: memberUserId, roleId: memberRoleId },
    { id: crypto.randomUUID(), userId: adminUserId,  roleId: adminRoleId  },
  ]);

  // Protected domains:
  // - "general-documents" must use the EXACT slug so canUploadToFolder's check
  //   (`folder.domainSlug === "general-documents"`) matches. Reuse any existing
  //   domain with that slug; create one only if none exists.
  // - Blocked domains use unique __uptest__ slugs to avoid production data collision.
  const domainIds = {} as Record<DomainSlug, string>;
  const createdDomainIds: string[] = [];

  // general-documents: find or create (only delete on teardown if WE created it)
  {
    const existing = await db
      .select({ id: protectedDomainsTable.id })
      .from(protectedDomainsTable)
      .where(eq(protectedDomainsTable.slug, "general-documents"))
      .limit(1);
    if (existing[0]) {
      domainIds["general-documents"] = existing[0].id;
      // pre-existing — do NOT add to createdDomainIds so teardown won't delete it
    } else {
      const id = crypto.randomUUID();
      await db.insert(protectedDomainsTable).values({
        id, lodgeId,
        name: "General Documents",
        slug: "general-documents",
        frame: "general",
        accessLogic: "role_only",
        allowedRoleSlugs: ["member"],
      });
      domainIds["general-documents"] = id;
      createdDomainIds.push(id);
    }
  }

  // Blocked domains: unique slugs — always track for teardown
  for (const slug of BLOCKED_SLUGS) {
    const id = crypto.randomUUID();
    const uniqueSlug = `__uptest__${slug}`;
    await db.insert(protectedDomainsTable).values({
      id, lodgeId,
      name: `__uptest__ ${slug}`,
      slug: uniqueSlug,
      frame: "general",
      accessLogic: "role_only",
      allowedRoleSlugs: ["member"],
    }).onConflictDoNothing();
    const [row] = await db
      .select({ id: protectedDomainsTable.id })
      .from(protectedDomainsTable)
      .where(eq(protectedDomainsTable.slug, uniqueSlug))
      .limit(1);
    domainIds[slug] = row.id;
    createdDomainIds.push(row.id);
  }

  // Folders: one per domain + a ritual folder with no domain
  const folderIds = {} as Record<DomainSlug | "ritual-no-domain", string>;
  const allDomainSlugs: DomainSlug[] = ["general-documents", ...BLOCKED_SLUGS];
  for (const slug of allDomainSlugs) {
    const id = crypto.randomUUID();
    await db.insert(documentFoldersTable).values({
      id, lodgeId, title: `__uptest__ folder ${slug}`,
      domainId: domainIds[slug], frame: "general",
    });
    folderIds[slug] = id;
  }
  const ritualId = crypto.randomUUID();
  await db.insert(documentFoldersTable).values({
    id: ritualId, lodgeId, title: "__uptest__ ritual folder", frame: "ritual",
  });
  folderIds["ritual-no-domain"] = ritualId;

  return {
    lodgeId,
    memberEmail: UPLOAD_MEMBER_EMAIL,
    adminEmail:  UPLOAD_ADMIN_EMAIL,
    password: TEST_PASSWORD,
    userIds: [memberUserId, adminUserId],
    roleIds: [memberRoleId, adminRoleId],
    domainIds,
    createdDomainIds,
    folderIds,
  };
}

async function teardownAll(fx: UploadFixtures): Promise<void> {
  const folderIdList = Object.values(fx.folderIds);

  // Documents must be removed before folders (FK: documents.folder_id → document_folders.id)
  if (folderIdList.length > 0) {
    await db.delete(documentsTable).where(inArray(documentsTable.folderId, folderIdList));
    await db.delete(documentFoldersTable).where(inArray(documentFoldersTable.id, folderIdList));
  }
  // Only delete domains we created — never delete pre-existing production domains
  if (fx.createdDomainIds.length > 0) {
    await db.delete(protectedDomainsTable).where(inArray(protectedDomainsTable.id, fx.createdDomainIds));
  }

  // Audit logs that reference our test users
  await db.delete(auditLogsTable).where(
    inArray(auditLogsTable.actorEmail, [UPLOAD_MEMBER_EMAIL, UPLOAD_ADMIN_EMAIL]),
  );
  if (fx.userIds.length > 0) {
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorId, fx.userIds));
    for (const uid of fx.userIds) {
      try {
        const { pool } = await import("@workspace/db");
        await pool.query("DELETE FROM sessions WHERE sess::text LIKE $1", [`%${uid}%`]);
      } catch { /* sessions table managed externally; safe to ignore */ }
    }
    await db.delete(userRolesTable).where(inArray(userRolesTable.userId, fx.userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, fx.userIds));
  }
  if (fx.roleIds.length > 0) {
    await db.delete(rolesTable).where(inArray(rolesTable.id, fx.roleIds));
  }
}

// ── Payload builder ────────────────────────────────────────────────────────

function uploadPayload(folderId: string) {
  return {
    folderId,
    title: "Test Upload",
    description: "upload permission test",
    fileName: "document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/documents/request-upload — upload permission gate", () => {
  let fx: UploadFixtures;

  beforeAll(async () => {
    fx = await seedAll();
  });

  afterAll(async () => {
    await teardownAll(fx);
  });

  // ── Unauthenticated ──────────────────────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .post("/api/documents/request-upload")
      .send(uploadPayload(fx.folderIds["general-documents"]));
    expect(res.status).toBe(401);
  });

  // ── Member: blocked domain folders ──────────────────────────────────────

  const blockedDomains = [
    "meeting-minutes",
    "secretary-documents",
    "treasury-documents",
    "wm-documents",
  ] as const;

  it.each(blockedDomains)(
    "returns 403 upload-rights error for Member → %s domain folder",
    async (slug) => {
      const agent = await loginAgent(app, fx.memberEmail, fx.password);
      const res = await agent
        .post("/api/documents/request-upload")
        .send(uploadPayload(fx.folderIds[slug]));

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/upload rights/i);
    },
  );

  // ── Member: ritual folder (no domain → no access at all) ─────────────

  it("returns 403 for Member → ritual folder (no domain, no access policy)", async () => {
    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent
      .post("/api/documents/request-upload")
      .send(uploadPayload(fx.folderIds["ritual-no-domain"]));

    // checkFolderAccess returns false (no domain, no policy) → 403 before upload check
    expect(res.status).toBe(403);
  });

  // ── Member: allowed domain folder ────────────────────────────────────────

  it("does NOT return upload-rights 403 for Member → general-documents folder", async () => {
    const agent = await loginAgent(app, fx.memberEmail, fx.password);
    const res = await agent
      .post("/api/documents/request-upload")
      .send(uploadPayload(fx.folderIds["general-documents"]));

    // The canUploadToFolder gate passed. The response might be 200 (if object
    // storage is available) or 500 (if not). Either way it must NOT be the
    // specific upload-rights 403 from canUploadToFolder.
    const isUploadRights403 =
      res.status === 403 &&
      typeof res.body?.error === "string" &&
      /upload rights/i.test(res.body.error);

    expect(isUploadRights403).toBe(false);
  });

  // ── Admin: every folder allowed ──────────────────────────────────────────

  const allFolderKeys = [
    "general-documents",
    "meeting-minutes",
    "secretary-documents",
    "treasury-documents",
    "wm-documents",
    "ritual-no-domain",
  ] as const;

  it.each(allFolderKeys)(
    "does NOT return upload-rights 403 for Admin → %s folder",
    async (key) => {
      const agent = await loginAgent(app, fx.adminEmail, fx.password);
      const res = await agent
        .post("/api/documents/request-upload")
        .send(uploadPayload(fx.folderIds[key]));

      const isUploadRights403 =
        res.status === 403 &&
        typeof res.body?.error === "string" &&
        /upload rights/i.test(res.body.error);

      expect(isUploadRights403).toBe(false);
    },
  );
});
