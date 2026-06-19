/**
 * Unit tests for matrixPermissions.ts helpers.
 *
 * Tests cover:
 *  - computeFromMatrix logic via getEffectivePermissionsWithContext (in-memory,
 *    no DB required since we stub the folder/matrix data)
 *  - Legacy fallback path (no matrix rows)
 *  - Admin bypass (level ≥ 80)
 *  - DEFAULT_DOMAIN_MATRIX shape validation
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_DOMAIN_MATRIX,
  getEffectivePermissionsWithContext,
} from "../src/lib/matrixPermissions";
import type { MatrixEntryDef } from "../src/lib/matrixPermissions";
import type { FolderAccessRow } from "../src/lib/folderAccess";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeFolder(id: string, parentId: string | null = null, domainSlug?: string): FolderAccessRow {
  return {
    id,
    title: `Folder ${id}`,
    frame: "general",
    lodgeId: "lodge-1",
    parentId,
    accessPolicy: null,
    domainId: domainSlug ? `domain-${domainSlug}` : null,
    domainSlug: domainSlug ?? null,
    domainAccessLogic: domainSlug ? "role_only" : null,
    domainAllowedRoleSlugs: domainSlug === "general-documents" ? ["member"] : null,
    domainMinDegree: null,
  };
}

function makeMatrixRow(
  folderId: string,
  subjectType: "role" | "degree",
  subjectKey: string,
  permission: string,
) {
  return { folderId, subjectType, subjectKey, permission };
}

const LODGE_ID = "lodge-1";
const MEMBER_LEVEL = 20;
const ADMIN_LEVEL = 80;

// ── Admin bypass ──────────────────────────────────────────────────────────────

describe("getEffectivePermissionsWithContext — admin bypass (level ≥ 80)", () => {
  const folder = makeFolder("root-1", null, "general-documents");
  const folders = [folder];
  const matrix: ReturnType<typeof makeMatrixRow>[] = [];
  const adminCtx = { maxPermLevel: ADMIN_LEVEL, roleSlugs: [], maxDegree: 0 };

  it("grants all permissions to admin even with empty matrix", async () => {
    const perms = await getEffectivePermissionsWithContext(adminCtx, "root-1", LODGE_ID, folders, matrix);
    expect(perms).toEqual({ canView: true, canUpload: true, canApprove: true, canManage: true });
  });

  it("grants all permissions to PM super (level 90)", async () => {
    const ctx = { maxPermLevel: 90, roleSlugs: [], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, folders, matrix);
    expect(perms).toEqual({ canView: true, canUpload: true, canApprove: true, canManage: true });
  });
});

// ── Non-member (level < 20) ───────────────────────────────────────────────────

describe("getEffectivePermissionsWithContext — non-member (level < 20)", () => {
  const folder = makeFolder("root-1", null, "general-documents");
  const matrix = [makeMatrixRow("root-1", "role", "member", "view")];

  it("denies all permissions for level 0", async () => {
    const ctx = { maxPermLevel: 0, roleSlugs: [], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms).toEqual({ canView: false, canUpload: false, canApprove: false, canManage: false });
  });

  it("denies all permissions for level 19", async () => {
    const ctx = { maxPermLevel: 19, roleSlugs: [], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms).toEqual({ canView: false, canUpload: false, canApprove: false, canManage: false });
  });
});

// ── Matrix: role:member special key ──────────────────────────────────────────

describe("getEffectivePermissionsWithContext — role:member grants any member", () => {
  const folder = makeFolder("root-1", null, "general-documents");
  const matrix = [
    makeMatrixRow("root-1", "role", "member", "view"),
    makeMatrixRow("root-1", "role", "member", "upload"),
  ];

  it("grants view and upload to any member (level 20, no special roles)", async () => {
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
    expect(perms.canApprove).toBe(false);
    expect(perms.canManage).toBe(false);
  });

  it("grants view and upload to level 25 user with any slug", async () => {
    const ctx = { maxPermLevel: 25, roleSlugs: ["some-other-role"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
  });
});

// ── Matrix: specific role keys ────────────────────────────────────────────────

describe("getEffectivePermissionsWithContext — specific role keys", () => {
  const folder = makeFolder("root-1", null, "secretary-documents");
  const matrix = [
    makeMatrixRow("root-1", "role", "secretary", "view"),
    makeMatrixRow("root-1", "role", "worshipful-master", "view"),
    makeMatrixRow("root-1", "role", "secretary", "upload"),
    makeMatrixRow("root-1", "role", "site-administrator", "approve"),
  ];

  it("grants view to secretary", async () => {
    const ctx = { maxPermLevel: 30, roleSlugs: ["secretary"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
    expect(perms.canApprove).toBe(false);
  });

  it("grants view to worshipful-master but not upload", async () => {
    const ctx = { maxPermLevel: 50, roleSlugs: ["worshipful-master"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(false);
  });

  it("denies all to a plain member with no matching role", async () => {
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-1", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(false);
    expect(perms.canUpload).toBe(false);
  });
});

// ── Matrix: degree-based access ───────────────────────────────────────────────

describe("getEffectivePermissionsWithContext — degree-based access", () => {
  const folder = makeFolder("root-ea", null, "ea-ritual");
  const matrix = [
    makeMatrixRow("root-ea", "degree", "1", "view"),
    makeMatrixRow("root-ea", "role", "past-master", "view"),
    makeMatrixRow("root-ea", "role", "past-master", "upload"),
  ];

  it("grants view to user with degree ≥ 1", async () => {
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 1 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-ea", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(false);
  });

  it("denies view to user with degree 0", async () => {
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-ea", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(false);
  });

  it("grants view and upload to past-master regardless of degree", async () => {
    const ctx = { maxPermLevel: 40, roleSlugs: ["past-master"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "root-ea", LODGE_ID, [folder], matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
  });

  it("requires degree ≥ 2 for fc-ritual (degree:2 row)", async () => {
    const fcFolder = makeFolder("root-fc", null, "fc-ritual");
    const fcMatrix = [makeMatrixRow("root-fc", "degree", "2", "view")];
    const ctx1 = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 1 };
    const ctx2 = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 2 };
    const p1 = await getEffectivePermissionsWithContext(ctx1, "root-fc", LODGE_ID, [fcFolder], fcMatrix);
    const p2 = await getEffectivePermissionsWithContext(ctx2, "root-fc", LODGE_ID, [fcFolder], fcMatrix);
    expect(p1.canView).toBe(false);
    expect(p2.canView).toBe(true);
  });
});

// ── Subfolder inheritance ─────────────────────────────────────────────────────

describe("getEffectivePermissionsWithContext — subfolder inherits root matrix", () => {
  const root = makeFolder("root-1", null, "general-documents");
  const child = makeFolder("child-1", "root-1");
  const grandchild = makeFolder("grand-1", "child-1");
  const folders = [root, child, grandchild];
  const matrix = [
    makeMatrixRow("root-1", "role", "member", "view"),
    makeMatrixRow("root-1", "role", "member", "upload"),
  ];

  it("grants view+upload to member accessing a direct subfolder", async () => {
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "child-1", LODGE_ID, folders, matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
  });

  it("grants view+upload to member accessing a grandchild subfolder", async () => {
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "grand-1", LODGE_ID, folders, matrix);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
  });
});

// ── Legacy fallback ───────────────────────────────────────────────────────────

describe("getEffectivePermissionsWithContext — legacy fallback (no matrix rows)", () => {
  it("falls back to canUploadToFolder for general-documents domain (member allowed)", async () => {
    const folder = makeFolder("test-folder", null, "general-documents");
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "test-folder", LODGE_ID, [folder], []);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(true);
  });

  it("falls back to canUploadToFolder for meeting-minutes domain (member blocked from upload)", async () => {
    const folder: FolderAccessRow = {
      ...makeFolder("test-folder-2", null, "meeting-minutes"),
      domainAccessLogic: "role_only",
      domainAllowedRoleSlugs: ["member"],
    };
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "test-folder-2", LODGE_ID, [folder], []);
    expect(perms.canView).toBe(true);
    expect(perms.canUpload).toBe(false);
  });

  it("denies access for folder with no domain and no matrix", async () => {
    const folder = makeFolder("orphan-folder");
    const ctx = { maxPermLevel: MEMBER_LEVEL, roleSlugs: ["member"], maxDegree: 0 };
    const perms = await getEffectivePermissionsWithContext(ctx, "orphan-folder", LODGE_ID, [folder], []);
    expect(perms.canView).toBe(false);
    expect(perms.canUpload).toBe(false);
  });
});

// ── DEFAULT_DOMAIN_MATRIX shape ───────────────────────────────────────────────

describe("DEFAULT_DOMAIN_MATRIX — shape validation", () => {
  const EXPECTED_SLUGS = [
    "general-documents",
    "meeting-minutes",
    "secretary-documents",
    "treasury-documents",
    "wm-documents",
    "ea-ritual",
    "fc-ritual",
    "mm-ritual",
    "pm-ritual",
  ];

  it("covers all 9 system domains", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(DEFAULT_DOMAIN_MATRIX[slug], `missing matrix for ${slug}`).toBeDefined();
    }
  });

  it("each domain matrix has at least one view row", () => {
    for (const slug of EXPECTED_SLUGS) {
      const hasView = DEFAULT_DOMAIN_MATRIX[slug].some((e: MatrixEntryDef) => e.permission === "view");
      expect(hasView, `${slug} has no view row`).toBe(true);
    }
  });

  it("each domain matrix has at least one manage row", () => {
    for (const slug of EXPECTED_SLUGS) {
      const hasManage = DEFAULT_DOMAIN_MATRIX[slug].some((e: MatrixEntryDef) => e.permission === "manage");
      expect(hasManage, `${slug} has no manage row`).toBe(true);
    }
  });

  it("general-documents allows member to view and upload", () => {
    const entries = DEFAULT_DOMAIN_MATRIX["general-documents"];
    const memberView = entries.some(
      (e: MatrixEntryDef) => e.subjectType === "role" && e.subjectKey === "member" && e.permission === "view",
    );
    const memberUpload = entries.some(
      (e: MatrixEntryDef) => e.subjectType === "role" && e.subjectKey === "member" && e.permission === "upload",
    );
    expect(memberView).toBe(true);
    expect(memberUpload).toBe(true);
  });

  it("meeting-minutes allows member to view but NOT upload", () => {
    const entries = DEFAULT_DOMAIN_MATRIX["meeting-minutes"];
    const memberView = entries.some(
      (e: MatrixEntryDef) => e.subjectType === "role" && e.subjectKey === "member" && e.permission === "view",
    );
    const memberUpload = entries.some(
      (e: MatrixEntryDef) => e.subjectType === "role" && e.subjectKey === "member" && e.permission === "upload",
    );
    expect(memberView).toBe(true);
    expect(memberUpload).toBe(false);
  });

  it("ea-ritual has a degree:1 view row", () => {
    const hasDegree1View = DEFAULT_DOMAIN_MATRIX["ea-ritual"].some(
      (e: MatrixEntryDef) => e.subjectType === "degree" && e.subjectKey === "1" && e.permission === "view",
    );
    expect(hasDegree1View).toBe(true);
  });

  it("fc-ritual has a degree:2 view row (not degree:1)", () => {
    const hasDegree2View = DEFAULT_DOMAIN_MATRIX["fc-ritual"].some(
      (e: MatrixEntryDef) => e.subjectType === "degree" && e.subjectKey === "2" && e.permission === "view",
    );
    const hasDegree1View = DEFAULT_DOMAIN_MATRIX["fc-ritual"].some(
      (e: MatrixEntryDef) => e.subjectType === "degree" && e.subjectKey === "1" && e.permission === "view",
    );
    expect(hasDegree2View).toBe(true);
    expect(hasDegree1View).toBe(false);
  });

  it("mm-ritual has a degree:3 view row", () => {
    const hasDegree3View = DEFAULT_DOMAIN_MATRIX["mm-ritual"].some(
      (e: MatrixEntryDef) => e.subjectType === "degree" && e.subjectKey === "3" && e.permission === "view",
    );
    expect(hasDegree3View).toBe(true);
  });

  it("wm-documents does not allow plain members to view", () => {
    const memberView = DEFAULT_DOMAIN_MATRIX["wm-documents"].some(
      (e: MatrixEntryDef) => e.subjectType === "role" && e.subjectKey === "member" && e.permission === "view",
    );
    expect(memberView).toBe(false);
  });

  it("all entries have valid permission values", () => {
    const VALID_PERMISSIONS = new Set(["view", "upload", "approve", "manage"]);
    for (const [slug, entries] of Object.entries(DEFAULT_DOMAIN_MATRIX)) {
      for (const e of entries as MatrixEntryDef[]) {
        expect(VALID_PERMISSIONS.has(e.permission), `${slug}: invalid permission '${e.permission}'`).toBe(true);
      }
    }
  });

  it("all entries have valid subject types", () => {
    const VALID_TYPES = new Set(["role", "degree"]);
    for (const [slug, entries] of Object.entries(DEFAULT_DOMAIN_MATRIX)) {
      for (const e of entries as MatrixEntryDef[]) {
        expect(VALID_TYPES.has(e.subjectType), `${slug}: invalid subjectType '${e.subjectType}'`).toBe(true);
      }
    }
  });

  it("no duplicate entries within any domain", () => {
    for (const [slug, entries] of Object.entries(DEFAULT_DOMAIN_MATRIX)) {
      const seen = new Set<string>();
      for (const e of entries as MatrixEntryDef[]) {
        const key = `${e.subjectType}:${e.subjectKey}:${e.permission}`;
        expect(seen.has(key), `${slug}: duplicate entry '${key}'`).toBe(false);
        seen.add(key);
      }
    }
  });
});
