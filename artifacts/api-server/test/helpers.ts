import request from "supertest";
import type { Express } from "express";
import { db, pool } from "@workspace/db";
import {
  lodgesTable,
  rolesTable,
  usersTable,
  userRolesTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "../src/lib/password";

const TEST_PASSWORD = "Test-Passw0rd!xyz";

const MEMBER_EMAIL = "__contract_test_member__@test.invalid";
const ADMIN_EMAIL = "__contract_test_admin__@test.invalid";
const MEMBER_ROLE_SLUG = "__contract_test_member__";
const ADMIN_ROLE_SLUG = "__contract_test_admin__";

export interface TestFixtures {
  lodgeId: string;
  memberUserId: string;
  adminUserId: string;
  memberRoleId: string;
  adminRoleId: string;
  member: { email: string; password: string };
  admin: { email: string; password: string };
}

async function getOrCreateRole(
  lodgeId: string,
  slug: string,
  name: string,
  permissionLevel: number,
): Promise<string> {
  const existing = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(eq(rolesTable.slug, slug))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = crypto.randomUUID();
  await db.insert(rolesTable).values({ id, lodgeId, slug, name, permissionLevel });
  return id;
}

async function createUser(
  lodgeId: string,
  email: string,
  passwordHash: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(usersTable).values({
    id,
    lodgeId,
    email: email.toLowerCase(),
    firstName: "Contract",
    lastName: "Test",
    passwordHash,
    isActive: true,
    membershipStatus: "active",
  });
  return id;
}

async function assignRole(userId: string, roleId: string): Promise<void> {
  await db
    .insert(userRolesTable)
    .values({ id: crypto.randomUUID(), userId, roleId })
    .onConflictDoNothing();
}

/**
 * Seeds a lodge-scoped set of fixtures: a member (below administrator level)
 * and an administrator (>= administrator level), each with a login password.
 * Reuses the existing lodge so audit log queries (scoped to the first lodge)
 * return rows.
 */
export async function setupFixtures(): Promise<TestFixtures> {
  const lodges = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
  if (!lodges[0]) {
    throw new Error(
      "No lodge configured in the database — cannot run api-server integration tests.",
    );
  }
  const lodgeId = lodges[0].id;

  // Clean up any leftovers from a previous interrupted run before recreating.
  await teardownFixtures();

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const memberRoleId = await getOrCreateRole(lodgeId, MEMBER_ROLE_SLUG, "Contract Test Member", 10);
  const adminRoleId = await getOrCreateRole(lodgeId, ADMIN_ROLE_SLUG, "Contract Test Admin", 90);

  const memberUserId = await createUser(lodgeId, MEMBER_EMAIL, passwordHash);
  const adminUserId = await createUser(lodgeId, ADMIN_EMAIL, passwordHash);

  await assignRole(memberUserId, memberRoleId);
  await assignRole(adminUserId, adminRoleId);

  return {
    lodgeId,
    memberUserId,
    adminUserId,
    memberRoleId,
    adminRoleId,
    member: { email: MEMBER_EMAIL, password: TEST_PASSWORD },
    admin: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
  };
}

/** Removes all rows created by setupFixtures, honoring foreign-key order. */
export async function teardownFixtures(): Promise<void> {
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.email, [MEMBER_EMAIL.toLowerCase(), ADMIN_EMAIL.toLowerCase()]));
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    // audit_logs.actor_id references users — clear those first.
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorId, userIds));
    await db.delete(userRolesTable).where(inArray(userRolesTable.userId, userIds));

    // Best-effort cleanup of any sessions created during login.
    for (const uid of userIds) {
      try {
        await pool.query("DELETE FROM sessions WHERE sess::text LIKE $1", [`%${uid}%`]);
      } catch {
        // sessions table is managed by connect-pg-simple; ignore if unavailable.
      }
    }

    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }

  // Remove audit logs written against the test emails (e.g. LOGIN_FAILED with no actorId).
  await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorEmail, [MEMBER_EMAIL, ADMIN_EMAIL]));
  await db.delete(rolesTable).where(inArray(rolesTable.slug, [MEMBER_ROLE_SLUG, ADMIN_ROLE_SLUG]));
}

/** Logs in via the real auth flow and returns a supertest agent with the session cookie. */
export async function loginAgent(
  app: Express,
  email: string,
  password: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

/** Inserts a marker audit log row so the admin audit list is guaranteed non-empty. */
export async function insertAuditMarker(lodgeId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(auditLogsTable).values({
    id,
    lodgeId,
    action: "LOGIN",
    actorEmail: ADMIN_EMAIL,
    detail: { contractTest: true },
  });
  return id;
}
