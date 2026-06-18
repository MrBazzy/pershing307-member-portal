---
name: Pershing307 Document Domains
description: DOCUMENT-DOMAINS-001 — domain-based access control for document folders; seeded domains, two-frame split, new admin pages.
---

## Role constants (portal `src/lib/roles.ts`)
VISITOR=10, MEMBER=20, ADMIN=80, PM_SUPER_LEVEL=90 (added in this sprint).
App.tsx re-exports VISITOR/MEMBER/ADMIN but NOT PM_SUPER_LEVEL — import directly from `@/lib/roles`.

## Access logic values
`role_only | degree_only | role_or_degree | role_and_degree` — stored in `protected_domains.accessLogic`.
canAccessDomain() in document-folders.ts implements all four cases.

## 9 seeded domains (slugs)
general-documents, meeting-minutes, secretary-documents, treasury-documents, wm-documents,
ea-ritual (role_or_degree, minDegree=1), fc-ritual (minDegree=2), mm-ritual (minDegree=3),
pm-ritual (role_only, past-master/wm/pmsuper).

**Why:** Auto-seeded on first GET /api/document-folders. Existing unlinked root folders auto-migrated to matching domain via slug comparison.

## Frame split (documents page)
Folders have `frame: "general" | "ritual"`. Portal /documents splits on this field:
- General frame: all non-ritual folders
- Ritual frame: ea-ritual, fc-ritual, mm-ritual, pm-ritual domains

## Admin pages added
- `/admin/document-management` — folder structure + domain linking (Admin+)
- `/admin/domains` → "Domains & Access Control" — domain CRUD + access rules (PM Super for mutations)

## OpenAPI schemas added
DocumentDomainItem, DocumentDomainListResult, DocumentDomainResult,
DocumentDomainCreateInput, DocumentDomainUpdateInput, DocumentDomainAccessUpdateInput,
DocumentFolderDomainLinkInput.
