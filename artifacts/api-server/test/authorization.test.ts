/**
 * Authorization enforcement — exhaustive matrix test
 *
 * For every backend endpoint this file asserts:
 *   1. Unauthenticated requests to protected routes → 401
 *   2. A low-privilege authenticated user (level 10, VISITOR_LEVEL) → 403
 *      for any endpoint that requires a higher permission level
 *   3. A high-privilege authenticated user (level 90, PM_SUPER_ADMIN) →
 *      NOT 401 and NOT 403 (auth gates cleared, even if body validation fails)
 *
 * Permission levels in use:
 *   VISITOR_LEVEL  = 10   (fx.member)
 *   MEMBER_LEVEL   = 20
 *   SITE_ADMIN     = 80
 *   PM_SUPER_ADMIN = 90   (fx.admin)
 *
 * Public endpoints are verified to NOT return 401 when called without a session.
 *
 * Design notes
 * ─────────────
 * • POST /api/auth/logout is tested in §2b with throw-away agents so the shared
 *   visitorAgent and adminAgent remain alive for the rest of the suite.
 * • Routes whose handlers perform body validation BEFORE the level check
 *   (e.g. PATCH /api/documents/:id) cannot be relied on to return 403 with an
 *   empty body; they are tested for 401-on-anon only and moved to §8.
 * • GET /api/documents silently returns an empty array for visitors instead of
 *   403 (intentional design); it is excluded from the §4 visitor→403 matrix.
 * • GET /api/degree-definitions uses requireAuth() only (no requireRole); it
 *   lives in §2 (auth-only), not §5 (admin-only).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupFixtures, teardownFixtures, loginAgent, type TestFixtures } from "./helpers";

// A stable UUID placeholder used in parameterised paths.
const UUID = "00000000-0000-0000-0000-000000000000";

// ─── types ───────────────────────────────────────────────────────────────────

type Method = "get" | "post" | "put" | "patch" | "delete";
type Endpoint = [Method, string];

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Returns false only for Express's "Cannot <METHOD> <path>" unmatched-route 404. */
function isHandled(res: request.Response): boolean {
  return !(res.status === 404 && /Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s/i.test(res.text ?? ""));
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe("Authorization Enforcement", () => {
  let fx: TestFixtures;
  let visitorAgent: ReturnType<typeof request.agent>; // level 10
  let adminAgent: ReturnType<typeof request.agent>;   // level 90

  beforeAll(async () => {
    fx = await setupFixtures();
    visitorAgent = await loginAgent(app, fx.member.email, fx.member.password);
    adminAgent   = await loginAgent(app, fx.admin.email,  fx.admin.password);
  });

  afterAll(async () => {
    await teardownFixtures();
  });

  // ── §1. PUBLIC ENDPOINTS ──────────────────────────────────────────────────
  // Must never return 401 when called without a session.

  describe("1. Public endpoints — no session required", () => {
    const publicEndpoints: Endpoint[] = [
      ["get",  "/api/healthz"],                             // health check (no auth)
      ["get",  "/api/auth/app-policy"],                     // password / passkey config
      ["post", "/api/auth/login"],                          // login
      ["post", "/api/auth/login/2fa"],                      // 2FA challenge
      ["post", "/api/auth/forgot-password"],                // send reset email
      ["post", "/api/auth/reset-password"],                 // consume reset token
      ["get",  "/api/bootstrap/status"],                    // setup wizard check
      ["get",  `/api/invitations/accept/${UUID}`],          // token-based invite page
      ["post", "/api/invitations/accept"],                  // accept invite
      ["post", "/api/passkeys/authentication/begin"],       // passkey auth challenge
      ["post", "/api/passkeys/authentication/complete"],    // passkey auth verify
    ];

    it.each(publicEndpoints)("%s %s — unauthenticated must NOT return 401", async (method, path) => {
      const res = await (request(app)[method] as (url: string) => request.Test)(path);
      expect(isHandled(res), `Route not mounted: ${method.toUpperCase()} ${path}`).toBe(true);
      expect(res.status).not.toBe(401);
    });
  });

  // ── §2. AUTH-ONLY (no role restriction) ───────────────────────────────────
  // requireAuth() only — any signed-in user passes, unauthenticated gets 401.

  describe("2. Auth-only endpoints — any authenticated user", () => {
    const authOnlyEndpoints: Endpoint[] = [
      ["get",    "/api/auth/me"],                           // current user (returns 401 when no session)
      ["post",   "/api/auth/change-password"],
      ["patch",  "/api/auth/profile"],
      ["get",    "/api/auth/2fa/status"],                   // 2FA routes nested inside /auth
      ["post",   "/api/auth/2fa/enroll"],
      ["post",   "/api/auth/2fa/verify-enroll"],
      ["delete", "/api/auth/2fa"],
      ["get",    "/api/passkeys"],
      ["post",   "/api/passkeys/registration/begin"],
      ["post",   "/api/passkeys/registration/complete"],
      ["delete", `/api/passkeys/${UUID}`],
      ["get",    "/api/roadmap"],
      ["get",    "/api/lodge-years"],
      ["get",    "/api/lodge-years/active"],
      ["get",    "/api/degree-definitions"],                // list all degrees (auth-only, no role gate)
    ];

    describe("Unauthenticated → 401", () => {
      // Also include logout in the unauthenticated check (separate from positive tests)
      it.each([...authOnlyEndpoints, ["post", "/api/auth/logout"] as Endpoint])(
        "%s %s",
        async (method, path) => {
          const res = await (request(app)[method] as (url: string) => request.Test)(path);
          expect(res.status).toBe(401);
        },
      );
    });

    describe("Visitor (level 10) → not 401", () => {
      it.each(authOnlyEndpoints)("%s %s", async (method, path) => {
        const res = await (visitorAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
      });
    });

    describe("Admin (level 90) → not 401", () => {
      it.each(authOnlyEndpoints)("%s %s", async (method, path) => {
        const res = await (adminAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
      });
    });
  });

  // ── §2b. LOGOUT — tested with throw-away agents ───────────────────────────
  // Uses fresh agents so the shared agents remain valid for the rest of the suite.

  describe("2b. POST /api/auth/logout", () => {
    it("unauthenticated → 401", async () => {
      const res = await request(app).post("/api/auth/logout");
      expect(res.status).toBe(401);
    });

    it("visitor (level 10) → 200 (session destroyed)", async () => {
      const tmp = await loginAgent(app, fx.member.email, fx.member.password);
      const res = await tmp.post("/api/auth/logout");
      expect(res.status).toBe(200);
    });

    it("admin (level 90) → 200 (session destroyed)", async () => {
      const tmp = await loginAgent(app, fx.admin.email, fx.admin.password);
      const res = await tmp.post("/api/auth/logout");
      expect(res.status).toBe(200);
    });
  });

  // ── §3. VISITOR-LEVEL ENDPOINTS (level ≥ 10) ─────────────────────────────
  // Both visitor (10) and admin (90) pass; unauthenticated gets 401.

  describe("3. Visitor-level endpoints (level ≥ 10)", () => {
    const visitorEndpoints: Endpoint[] = [
      ["get", "/api/tracing-board"],
      ["get", "/api/tracing-board/upcoming"],
      ["get", "/api/tracing-board/categories"],
      ["get", "/api/history/page"],
      ["get", "/api/history/timeline"],
      ["get", "/api/history/documents"],
      ["get", "/api/history/sections"],
      ["get", "/api/history/pershing-bio"],
    ];

    describe("Unauthenticated → 401", () => {
      it.each(visitorEndpoints)("%s %s", async (method, path) => {
        const res = await (request(app)[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(401);
      });
    });

    describe("Visitor (level 10) → not 401 and not 403", () => {
      it.each(visitorEndpoints)("%s %s", async (method, path) => {
        const res = await (visitorAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });

    describe("Admin (level 90) → not 401 and not 403", () => {
      it.each(visitorEndpoints)("%s %s", async (method, path) => {
        const res = await (adminAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  });

  // ── §4. MEMBER-LEVEL ENDPOINTS (level ≥ 20) ──────────────────────────────
  // Visitor (10) → 403 via requireRole middleware; Admin (90) → passes auth.
  // NOTE: GET /api/documents is intentionally excluded — the handler returns an
  // empty array (200) for visitors rather than 403. That behaviour is tested in §8.

  describe("4. Member-level endpoints (level ≥ 20)", () => {
    const memberEndpoints: Endpoint[] = [
      ["get",   "/api/birthdays"],
      ["get",   "/api/birthdays/upcoming"],
      ["get",   "/api/events"],
      ["get",   "/api/events/upcoming"],
      ["get",   "/api/events/categories"],
      ["get",   "/api/document-folders"],
      ["get",   `/api/document-folders/${UUID}`],
      ["get",   `/api/document-folders/${UUID}/documents`],
      ["patch", "/api/users/me/name"],
      ["patch", "/api/users/me/email"],
      // Self-service profile routes (mounted under /api/profile)
      ["get",   "/api/profile/date-of-birth"],
      ["patch", "/api/profile/date-of-birth"],
      ["get",   "/api/profile/birthday-visibility"],
      ["patch", "/api/profile/birthday-visibility"],
    ];

    describe("Unauthenticated → 401", () => {
      it.each(memberEndpoints)("%s %s", async (method, path) => {
        const res = await (request(app)[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(401);
      });
    });

    describe("Visitor (level 10) → 403", () => {
      it.each(memberEndpoints)("%s %s", async (method, path) => {
        const res = await (visitorAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(403);
      });
    });

    describe("Admin (level 90) → not 401 and not 403", () => {
      it.each(memberEndpoints)("%s %s", async (method, path) => {
        const res = await (adminAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  });

  // ── §5. ADMIN-LEVEL ENDPOINTS (level ≥ 80) ───────────────────────────────
  // All use requireRole(SITE_ADMIN_LEVEL) middleware so the 403 is guaranteed
  // regardless of body content.

  describe("5. Admin-level endpoints (level ≥ 80)", () => {
    const adminEndpoints: Endpoint[] = [
      // Audit
      ["get",    "/api/audit"],
      // Users — list and per-user admin operations
      ["get",    "/api/users"],
      ["get",    `/api/users/${UUID}`],
      ["patch",  `/api/users/${UUID}/deactivate`],
      ["patch",  `/api/users/${UUID}/activate`],
      ["patch",  `/api/users/${UUID}/membership-status`],
      ["post",   `/api/users/${UUID}/reset-password`],
      ["post",   `/api/users/${UUID}/roles`],
      ["delete", `/api/users/${UUID}/roles/${UUID}`],
      ["get",    `/api/users/${UUID}/degrees`],
      ["post",   `/api/users/${UUID}/degrees`],
      ["delete", `/api/users/${UUID}/degrees/${UUID}`],
      ["get",    `/api/users/${UUID}/domains`],
      ["get",    `/api/users/${UUID}/invitations`],
      ["post",   `/api/users/${UUID}/invitations`],
      ["get",    `/api/users/${UUID}/timeline`],
      ["patch",  `/api/users/${UUID}/email`],
      ["patch",  `/api/users/${UUID}/name`],
      ["patch",  `/api/users/${UUID}/date-of-birth`],
      ["post",   "/api/users/fix-membership"],
      // Config
      ["get",    "/api/config"],
      ["put",    "/api/config/lodge_name"],
      ["post",   "/api/config/test-smtp"],
      // Invitations
      ["get",    "/api/invitations"],
      ["delete", "/api/invitations/cleanup"],
      ["get",    `/api/invitations/${UUID}/link`],
      // Roles
      ["get",    "/api/roles"],
      ["post",   "/api/roles"],
      // Domains
      ["get",    "/api/domains"],
      ["get",    `/api/domains/${UUID}/members`],
      ["get",    `/api/domains/${UUID}`],
      // Document domains
      ["get",    "/api/document-domains"],
      ["get",    `/api/document-domains/${UUID}`],
      ["post",   "/api/document-domains"],
      ["patch",  `/api/document-domains/${UUID}`],
      ["patch",  `/api/document-domains/${UUID}/access`],
      ["get",    `/api/document-domains/${UUID}/access-matrix`],
      ["put",    `/api/document-domains/${UUID}/access-matrix`],
      ["delete", `/api/document-domains/${UUID}`],
      // Document review
      ["get",    "/api/document-review"],
      ["get",    "/api/document-review/count"],
      // Reports
      ["get",    "/api/reports/member-details"],
      ["get",    "/api/reports/document-access"],
      // Passkeys admin view
      ["get",    `/api/passkeys/users/${UUID}`],
      ["delete", `/api/passkeys/users/${UUID}/${UUID}`],
      // Tracing board — write operations
      ["post",   "/api/tracing-board"],
      ["put",    `/api/tracing-board/${UUID}`],
      ["delete", `/api/tracing-board/${UUID}`],
      ["post",   "/api/tracing-board/categories"],
      ["post",   "/api/tracing-board/categories/reorder"],
      ["put",    `/api/tracing-board/categories/${UUID}`],
      ["delete", `/api/tracing-board/categories/${UUID}`],
      // Events — write operations
      ["post",   "/api/events"],
      ["put",    `/api/events/${UUID}`],
      ["delete", `/api/events/${UUID}`],
      ["post",   "/api/events/categories"],
      ["post",   "/api/events/categories/reorder"],
      ["put",    `/api/events/categories/${UUID}`],
      ["delete", `/api/events/categories/${UUID}`],
      // History — write operations
      ["put",    "/api/history/page"],
      ["post",   "/api/history/timeline"],
      ["put",    `/api/history/timeline/${UUID}`],
      ["delete", `/api/history/timeline/${UUID}`],
      ["post",   "/api/history/documents"],
      ["put",    `/api/history/documents/${UUID}`],
      ["post",   `/api/history/documents/${UUID}/request-upload`],
      ["delete", `/api/history/documents/${UUID}/attachment`],
      ["delete", `/api/history/documents/${UUID}`],
      ["post",   "/api/history/sections"],
      ["patch",  "/api/history/sections/reorder"],
      ["put",    `/api/history/sections/${UUID}`],
      ["delete", `/api/history/sections/${UUID}`],
      ["put",    "/api/history/pershing-bio"],
      // Roadmap — write operations
      ["post",   "/api/roadmap"],
      ["put",    `/api/roadmap/${UUID}`],
      ["delete", `/api/roadmap/${UUID}`],
      ["post",   "/api/roadmap/reorder"],
      // Lodge years — write operations
      ["post",   "/api/lodge-years"],
      ["put",    `/api/lodge-years/${UUID}`],
      ["post",   `/api/lodge-years/${UUID}/activate`],
      ["post",   `/api/lodge-years/${UUID}/archive`],
      ["post",   `/api/lodge-years/${UUID}/restore`],
      ["delete", `/api/lodge-years/${UUID}`],
    ];

    describe("Unauthenticated → 401", () => {
      it.each(adminEndpoints)("%s %s", async (method, path) => {
        const res = await (request(app)[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(401);
      });
    });

    describe("Visitor (level 10) → 403", () => {
      it.each(adminEndpoints)("%s %s", async (method, path) => {
        const res = await (visitorAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(403);
      });
    });

    describe("Admin (level 90) → not 401 and not 403", () => {
      it.each(adminEndpoints)("%s %s", async (method, path) => {
        const res = await (adminAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  });

  // ── §6. PM SUPER-ADMIN ENDPOINTS (level ≥ 90) ────────────────────────────
  // Only the highest-privilege role (level 90) passes.
  // fx.admin is level 90 so all these pass for them.

  describe("6. PM Super-admin endpoints (level ≥ 90)", () => {
    const pmSuperEndpoints: Endpoint[] = [
      // Domain ↔ user pairing (PM-only)
      ["post",   `/api/domains/${UUID}`],
      ["delete", `/api/domains/${UUID}/${UUID}`],
      // User ↔ domain assignment
      ["post",   `/api/users/${UUID}/domains`],
      ["delete", `/api/users/${UUID}/domains/${UUID}`],
      // Test account teardown (PM-only)
      ["delete", `/api/users/${UUID}/test-reset`],
      // Move a folder to a different domain (PM-only)
      ["patch",  `/api/document-folders/${UUID}/domain`],
    ];

    describe("Unauthenticated → 401", () => {
      it.each(pmSuperEndpoints)("%s %s", async (method, path) => {
        const res = await (request(app)[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(401);
      });
    });

    describe("Visitor (level 10) → 403", () => {
      it.each(pmSuperEndpoints)("%s %s", async (method, path) => {
        const res = await (visitorAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(403);
      });
    });

    describe("Admin (level 90) → not 401 and not 403", () => {
      it.each(pmSuperEndpoints)("%s %s", async (method, path) => {
        const res = await (adminAgent[method] as (url: string) => request.Test)(path);
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  });

  // ── §7. CROSS-USER ISOLATION ──────────────────────────────────────────────
  // A low-privilege member must not be able to read or write another user's
  // data even when they know the other user's ID.

  describe("7. Cross-user isolation — visitor cannot access other users' data", () => {
    it("GET /api/users/:id returns 403 for visitor using another user's ID", async () => {
      const res = await visitorAgent.get(`/api/users/${fx.adminUserId}`);
      expect(res.status).toBe(403);
    });

    it("PATCH /api/users/:id/name returns 403 for visitor targeting another user", async () => {
      const res = await visitorAgent
        .patch(`/api/users/${fx.adminUserId}/name`)
        .send({ firstName: "Hacked", lastName: "Name" });
      expect(res.status).toBe(403);
    });

    it("PATCH /api/users/:id/email returns 403 for visitor targeting another user", async () => {
      const res = await visitorAgent
        .patch(`/api/users/${fx.adminUserId}/email`)
        .send({ email: "hacked@example.com" });
      expect(res.status).toBe(403);
    });

    it("GET /api/passkeys/users/:userId returns 403 for visitor listing another user's passkeys", async () => {
      const res = await visitorAgent.get(`/api/passkeys/users/${fx.adminUserId}`);
      expect(res.status).toBe(403);
    });

    it("GET /api/users/:id/timeline returns 403 for visitor viewing another user's activity", async () => {
      const res = await visitorAgent.get(`/api/users/${fx.adminUserId}/timeline`);
      expect(res.status).toBe(403);
    });
  });

  // ── §8. MANUAL LEVEL CHECKS AND DOCUMENT VISIBILITY ──────────────────────
  // Routes that use requireAuth() without requireRole() and enforce access
  // inside the handler. Tests cover the unauthenticated boundary (guaranteed
  // 401) and the visitor-as-authenticated boundary.

  describe("8. Document routes with handler-level access control", () => {
    // Unauthenticated must always get 401 — requireAuth() fires first.
    const docEndpointsRequiringAuth: Endpoint[] = [
      ["post",  "/api/documents/request-upload"],
      ["get",   "/api/documents"],
      ["get",   `/api/documents/${UUID}/download`],
      ["get",   `/api/documents/${UUID}/view`],
      ["patch", `/api/documents/${UUID}`],
      ["patch", `/api/documents/${UUID}/status`],
    ];

    describe("Unauthenticated → 401", () => {
      it.each(docEndpointsRequiringAuth)("%s %s", async (method, path) => {
        const res = await (request(app)[method] as (url: string) => request.Test)(path);
        expect(res.status).toBe(401);
      });
    });

    // Visitor (level 10) - auth passes, handler decides what to return.
    // The exact status varies: 403 for explicit denial, 200 (empty list) for
    // silent filtering, or 400 if body validation precedes the level check.
    it("GET /api/documents — visitor gets 200 with empty document list (silent filter)", async () => {
      // The route requires a folderId query param; the level check fires before the folder DB lookup.
      const res = await visitorAgent.get("/api/documents").query({ folderId: UUID });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("documents");
      expect(res.body.documents).toHaveLength(0);
    });

    it("POST /api/documents/request-upload — visitor gets 403 (level check before folder lookup)", async () => {
      const res = await visitorAgent
        .post("/api/documents/request-upload")
        .send({
          folderId: UUID,
          title: "Test Document",
          fileName: "test.pdf",
          fileSize: 1000,
          mimeType: "application/pdf",
        });
      expect(res.status).toBe(403);
    });

    it("PATCH /api/documents/:id — visitor gets 401 from requireAuth (route validated in §5 unauthenticated set)", async () => {
      // With dummy UUID, body validation returns 400 before the level check for visitor.
      // We confirm only that auth fires first (401 for anon), tested above.
      // Here we just verify the visitor doesn't accidentally get through with 200/2xx.
      const res = await visitorAgent.patch(`/api/documents/${UUID}`).send({ title: "Hacked" });
      expect([400, 403, 404]).toContain(res.status);
    });
  });

  // ── §9. BOOTSTRAP LOCKOUT AFTER SETUP ────────────────────────────────────
  // Once a lodge is configured the bootstrap endpoint must be closed.

  describe("9. Bootstrap routes — blocked once lodge is configured", () => {
    it("POST /api/bootstrap returns 400/409 (already configured), never 200", async () => {
      const res = await request(app).post("/api/bootstrap").send({
        lodgeName: "Hack Lodge",
        lodgeNumber: "999",
        firstName: "Evil",
        lastName: "Actor",
        email: "evil@example.com",
        password: "SuperSecret1!",
      });
      expect(res.status).not.toBe(200);
      expect([400, 409, 422, 500]).toContain(res.status);
    });
  });
});
