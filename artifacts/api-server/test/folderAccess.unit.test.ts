/**
 * Unit tests for canUploadToFolder in lib/folderAccess.ts
 *
 * These are pure-function tests — no DB, no HTTP. They guard against regressions
 * where a refactor accidentally broadens or narrows the Member upload permission.
 */
import { describe, it, expect } from "vitest";
import { canUploadToFolder } from "../src/lib/folderAccess";
import type { FolderAccessRow } from "../src/lib/folderAccess";

const MEMBER_LEVEL = 20;
const ADMIN_LEVEL = 80;

function makeFolder(overrides: Partial<FolderAccessRow> = {}): FolderAccessRow {
  return {
    id: "test-folder-id",
    title: "Test Folder",
    frame: "general",
    lodgeId: "test-lodge-id",
    parentId: null,
    accessPolicy: null,
    domainId: null,
    domainSlug: null,
    domainAccessLogic: null,
    domainAllowedRoleSlugs: null,
    domainMinDegree: null,
    ...overrides,
  };
}

describe("canUploadToFolder — Member (level 20)", () => {
  it("allows upload to a general-documents domain folder", () => {
    const folder = makeFolder({ domainSlug: "general-documents" });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(true);
  });

  it("blocks upload to a meeting-minutes domain folder", () => {
    const folder = makeFolder({ domainSlug: "meeting-minutes" });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks upload to a secretary-documents domain folder", () => {
    const folder = makeFolder({ domainSlug: "secretary-documents" });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks upload to a treasury-documents domain folder", () => {
    const folder = makeFolder({ domainSlug: "treasury-documents" });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks upload to a wm-documents domain folder", () => {
    const folder = makeFolder({ domainSlug: "wm-documents" });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks upload to a folder with no domain (domainSlug null)", () => {
    const folder = makeFolder({ domainSlug: null });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks upload to a ritual-frame folder (no domain)", () => {
    const folder = makeFolder({ frame: "ritual", domainSlug: null });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks upload to a ritual-frame folder even with an arbitrary domain slug", () => {
    // canUploadToFolder keys only on domainSlug; 'ritual-docs' is not general-documents
    const folder = makeFolder({ frame: "ritual", domainSlug: "ritual-docs" });
    expect(canUploadToFolder(folder, MEMBER_LEVEL)).toBe(false);
  });

  it("blocks a user just below member level (level 19)", () => {
    const folder = makeFolder({ domainSlug: "general-documents" });
    expect(canUploadToFolder(folder, 19)).toBe(false);
  });
});

describe("canUploadToFolder — Admin (level ≥ 80)", () => {
  const testCases: Array<{ label: string; slug: string | null; frame?: string }> = [
    { label: "general-documents domain",    slug: "general-documents" },
    { label: "meeting-minutes domain",      slug: "meeting-minutes" },
    { label: "secretary-documents domain",  slug: "secretary-documents" },
    { label: "treasury-documents domain",   slug: "treasury-documents" },
    { label: "wm-documents domain",         slug: "wm-documents" },
    { label: "no domain (null slug)",        slug: null },
    { label: "ritual frame folder",          slug: null, frame: "ritual" },
  ];

  it.each(testCases)("allows upload to $label", ({ slug, frame }) => {
    const folder = makeFolder({ domainSlug: slug, frame: frame ?? "general" });
    expect(canUploadToFolder(folder, ADMIN_LEVEL)).toBe(true);
  });

  it("allows upload at exactly level 80", () => {
    const folder = makeFolder({ domainSlug: "meeting-minutes" });
    expect(canUploadToFolder(folder, 80)).toBe(true);
  });

  it("allows upload at level 100", () => {
    const folder = makeFolder({ domainSlug: "secretary-documents" });
    expect(canUploadToFolder(folder, 100)).toBe(true);
  });
});
