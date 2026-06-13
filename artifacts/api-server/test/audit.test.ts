import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import {
  setupFixtures,
  teardownFixtures,
  loginAgent,
  insertAuditMarker,
  type TestFixtures,
} from "./helpers";

describe("GET /api/audit (audit log list)", () => {
  let fx: TestFixtures;

  beforeAll(async () => {
    fx = await setupFixtures();
  });

  afterAll(async () => {
    await teardownFixtures();
  });

  it("is reachable at /api/audit (route is mounted, not 404)", async () => {
    const res = await request(app).get("/api/audit");
    // The exact bug class this guards: a 404 here means the server mount path
    // diverged from the path the generated client calls.
    expect(res.status).not.toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/audit");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated user below administrator level", async () => {
    const agent = await loginAgent(app, fx.member.email, fx.member.password);
    const res = await agent.get("/api/audit");
    expect(res.status).toBe(403);
  });

  it("returns 200 with rows for an administrator", async () => {
    const markerId = await insertAuditMarker(fx.lodgeId);
    const agent = await loginAgent(app, fx.admin.email, fx.admin.password);
    const res = await agent.get("/api/audit").query({ limit: 100, offset: 0 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs.some((l: { id: string }) => l.id === markerId)).toBe(true);
  });
});
