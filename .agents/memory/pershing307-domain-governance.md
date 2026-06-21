---
name: Pershing307 Domain Governance
description: DOMAIN-GOVERNANCE-001 implementation — domainProtectionLevel field, enforcement rules, test patterns, dist rebuild requirement.
---

## Feature: domainProtectionLevel

`protectedDomainsTable` has a `domainProtectionLevel` column: `standard | past_master_protected`.

**Rule:** Site Admins (80) can CRUD `standard` domains freely. Any write to a `past_master_protected` domain by level < 90 returns 403 + writes a `DOMAIN_PROTECTION_BLOCKED` audit log entry. PM Super Admins (90) can manage any domain.

**Why:** Ritual-sensitive domains (e.g. Past Master Ritual) must be read-only to Site Admins to prevent accidental exposure changes.

**How to apply:**
- All write routes (POST with `past_master_protected`, PATCH, DELETE, PUT access-matrix) must call `getUserLevel(userId)` and check against `PM_SUPER_LEVEL = 90`.
- Also block Site Admins from *escalating* a standard domain to past_master_protected via PATCH.
- Read routes (GET list, GET by ID) are unrestricted at Site Admin level.

## Test fixture conventions (domainProtection.test.ts)

- Slugs must match `/^[a-z0-9-]+$/` — no underscores.
- `documentFoldersTable` requires `title` (NOT `name`/`slug`). System root folder needs `isSystemRoot: true`, `frame`, `title`, `lodgeId`, `domainId`.
- Teardown: delete `documentFoldersTable` rows where `domainId IN (test domain IDs)` BEFORE deleting domains (FK constraint).
- Test email addresses with `__` in them are fine (they're not slug-validated).

## Dist declaration files

When editing `lib/api-client-react/src/generated/api.schemas.ts`, also update `lib/api-client-react/dist/generated/api.schemas.d.ts` manually (tsc can't compile due to pre-existing `RoleUpdateInput` error in `api.ts`). The portal reads from dist/ via project references.
