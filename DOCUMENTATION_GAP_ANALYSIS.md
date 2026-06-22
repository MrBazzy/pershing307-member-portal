# Documentation Gap Analysis — Pershing No. 307 Member Portal

**Date:** June 22, 2026  
**Scope:** Full codebase — API server, portal frontend, database schema, infrastructure

---

## Executive Summary

The project has a solid foundation of architectural documentation (TECHNICAL_ARCHITECTURE.md, DATABASE_DESIGN.md, PROJECT_STRUCTURE.md) and a user-facing manual, but has significant gaps in developer-facing reference documentation, inline code documentation, and operational runbooks. Of the 27 API route files, **25 have zero JSDoc comments**. All 31 database schema files lack inline column-level comments. The OpenAPI spec covers only ~92% of actual endpoints and documents security requirements on only ~39% of those. The `replit.md` quick-start file is almost entirely unpopulated placeholder text.

---

## 1. What Exists Today

| Document | Location | Lines | Status |
|----------|----------|-------|--------|
| Technical Architecture | `TECHNICAL_ARCHITECTURE.md` | 305 | ✅ Good |
| Database Design | `DATABASE_DESIGN.md` | 394 | ✅ Good |
| Project Structure | `PROJECT_STRUCTURE.md` | 180 | ✅ Good |
| OpenAPI Spec | `lib/api-spec/openapi.yaml` | — | ⚠️ Incomplete |
| User/Admin Manual | `Pershing307_Member_Portal_Manual.docx` | — | ✅ Exists |
| Installation Guide | `docs/INSTALLATION_GUIDE.md` | — | ✅ Exists |
| User Guide | `docs/USER_GUIDE.md` | — | ✅ Exists |
| Administrator Guide | `docs/ADMINISTRATOR_GUIDE.md` | — | ✅ Exists |
| Quick-start (replit.md) | `replit.md` | — | ❌ Placeholders only |
| Package READMEs | api-server, portal, lib/db | — | ❌ None exist |

---

## 2. Gap Inventory

### 2.1 OpenAPI Specification — Endpoint Coverage

**Finding:** The authorization test suite exercises **160+ endpoints**, but the OpenAPI spec contains only **147 `operationId` entries** — leaving approximately 13–15 endpoints undocumented in the contract.

**Finding:** Only **58 of 147 operations (~39%)** have `security:` requirements declared. Endpoints that enforce `requireAuth()` or `requireRole()` at the Express middleware level are invisible to consumers relying solely on the spec.

**Finding:** Error responses average **~1.3 documented status codes per endpoint** (187 entries ÷ 147 operations). Most routes return 4–6 distinct status codes (400 body validation, 401 unauthenticated, 403 insufficient level, 404 not found, 422 business rule, 500 server error). Coverage is very thin.

**Missing endpoints (estimated):**
- `POST /api/auth/login/2fa` — 2FA step-up login
- `GET/POST /api/auth/2fa/*` — TOTP enrollment and verification
- `GET/PATCH /api/profile/date-of-birth` — member self-service
- `GET/PATCH /api/profile/birthday-visibility` — member self-service
- `GET /api/document-review/count` — pending review badge count
- Several passkey endpoints (`/authentication/begin`, `/authentication/complete`)

**Priority:** High — the spec is the contract used to generate the React Query client. Missing endpoints mean the frontend cannot use generated hooks for those features.

---

### 2.2 API Route Files — Inline Documentation

**Finding:** **25 of 27 route files have zero JSDoc comments.** Only `document-folders.ts` (3 comments) and `storage.ts` (2 comments) have any.

| Route File | JSDoc Comments | Complexity |
|------------|---------------|-----------|
| `auth.ts` | 0 | High — login, logout, 2FA, session |
| `users.ts` | 0 | High — CRUD, level management, deactivation |
| `documents.ts` | 0 | High — upload flow, access matrix, review |
| `document-domains.ts` | 0 | High — domain governance, protection levels |
| `document-folders.ts` | 3 | High — folder hierarchy, domain assignment |
| `config-admin.ts` | 0 | Medium — key-value config, SMTP test |
| `reports.ts` | 0 | Medium — onboarding stats, computed joins |
| `passkeys.ts` | 0 | High — WebAuthn registration, authentication |
| `two-factor.ts` | 0 | High — TOTP enrollment, verification, recovery |
| `invitations.ts` | 0 | Medium — invite lifecycle, expiry |
| `history.ts` | 0 | Medium — lodge history CRUD |
| `audit.ts` | 0 | Low — read-only log access |
| `bootstrap.ts` | 0 | High — first-run lockout logic |
| `profile.ts` | 0 | Low — self-service profile fields |
| `birthdays.ts` | 0 | Low — visibility-filtered query |
| `domains.ts` | 0 | Medium — domain access grants |
| `events.ts` | 0 | Low — event CRUD |
| `roadmap.ts` | 0 | Low — roadmap items |
| `tracing-board.ts` | 0 | Low — tracing board entries |
| `degrees.ts` | 0 | Low — degree definitions |
| `roles.ts` | 0 | Low — role management |
| `lodge-years.ts` | 0 | Low — lodge year records |
| `storage.ts` | 2 | Medium — object storage ACL |
| `health.ts` | 0 | Low — health check |
| `document-notice.ts` | 0 | Low — notice acceptance |
| `document-review.ts` | 0 | Medium — review queue |
| `reports.ts` | 0 | Medium |

**What's missing per route:** purpose statement, permission level required, business rules enforced (e.g., "lodge must be bootstrapped"), and non-obvious side-effects (e.g., "creates audit log entry", "sends email").

---

### 2.3 Database Schema — Column-Level Comments

**Finding:** All **31 schema files have zero inline comments** on columns.

This matters most for non-obvious fields:

| Table | Undocumented Columns of Note |
|-------|------------------------------|
| `users` | `permissionLevel` numeric scale (10/20/80/90), `isDeactivated` vs deleted |
| `document_folders` | `domainId` nullable FK meaning, `parentFolderId` hierarchy rules |
| `folder_access_matrix` | `minLevel` semantics vs domain access, override priority |
| `protected_domains` | `domainProtectionLevel` — what values exist and what they enforce |
| `configuration` | Key names, value types, and effect for all 15+ keys |
| `invitations` | `status` enum values and state machine transitions |
| `audit_logs` | `action` enum — full list of possible values |
| `two_factor_settings` | `isPending` vs confirmed distinction |
| `passkey_credentials` | `counter`, `credentialPublicKey` binary format |
| `user_domain_access` | Relationship to `folder_access_matrix` — when is each used? |

---

### 2.4 Permission Level System

**Finding:** The numeric permission level system is not formally documented anywhere in developer-facing docs.

**Undocumented:**
- The four levels and their names: Visitor (10), Member (20), Site Admin (80), PM Super (90)
- Which routes require which level
- How `requireRole(minLevel)` middleware interacts with `requireDomain()` middleware
- What "PM Super" means and why it differs from Site Admin
- The `PM_SUPER_LEVEL` constant defined in the domain governance code
- Why level 10 is called "visitor" — visitors are pre-created users who have not yet accepted an invitation

**Recommended location:** A dedicated `PERMISSION_MODEL.md` or a new section in `TECHNICAL_ARCHITECTURE.md`.

---

### 2.5 Environment Variables

**Finding:** 20 environment variables are referenced in source code. Documentation is scattered and incomplete.

| Variable | Where Used | Documented? |
|----------|-----------|------------|
| `DATABASE_URL` | DB connection | ✅ replit.md |
| `SESSION_SECRET` | Express session | ⚠️ Architecture doc only |
| `PORT` | All services | ✅ replit.md |
| `NODE_ENV` | Guards/config | ⚠️ Implied |
| `APP_BASE_URL` | Email links, WebAuthn | ❌ Not documented |
| `ALLOWED_ORIGINS` | CORS config | ❌ Not documented |
| `LOG_LEVEL` | Pino logger | ❌ Not documented |
| `SESSION_TIMEOUT_MIN` | Session duration | ❌ Not documented |
| `SMTP_HOST` | Email sending | ⚠️ Manual only |
| `SMTP_PORT` | Email sending | ⚠️ Manual only |
| `SMTP_USER` | Email sending | ⚠️ Manual only |
| `SMTP_PASS` | Email sending | ⚠️ Manual only |
| `SMTP_FROM` | Email sending | ⚠️ Manual only |
| `SMTP_FROM_NAME` | Email from-name | ⚠️ Manual only |
| `WEBAUTHN_RP_ID` | Passkey config | ❌ Not documented |
| `WEBAUTHN_RP_NAME` | Passkey config | ❌ Not documented |
| `WEBAUTHN_RP_ORIGIN` | Passkey config | ❌ Not documented |
| `PRIVATE_OBJECT_DIR` | Object storage | ❌ Not documented |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Object storage | ❌ Not documented |
| `APP_ENV` | Environment banner | ❌ Not documented |

**Missing:** A single `.env.example` or `ENV_VARS.md` file listing all variables with type, required/optional, default, and effect.

---

### 2.6 Document Access Control System

**Finding:** The document access control system is architecturally complex and has minimal documentation.

**Undocumented:**
- How `protected_domains`, `user_domain_access`, `folder_access_matrix`, and `document_folders.domainId` interact in priority order
- The `domainProtectionLevel` field: what values (`OPEN`, `RESTRICTED`, `PM_SUPER`) mean and who can grant access
- When a folder's access is determined by its domain vs. by direct matrix entries
- The "handler-level enforcement" pattern — why some routes use middleware and others do manual checks in the handler body
- The "silent filter" behavior on `GET /api/documents` — returning empty results vs. 403 for unauthorized access
- Admin bypass behavior: which routes short-circuit the access matrix for Site Admins

**Recommended location:** Expand `DATABASE_DESIGN.md` with a "Document Access Control" section, or create `docs/DOCUMENT_ACCESS_CONTROL.md`.

---

### 2.7 Operational Runbooks (Missing Entirely)

The following operational procedures have no documentation:

| Runbook | Why Needed |
|---------|-----------|
| **First Deploy / Bootstrap** | How to stand up a fresh instance: DB migration, first-admin creation via `/api/bootstrap`, confirm lockout |
| **Production Deployment** | Steps to deploy, verify, roll back; how to push DB schema changes to production without downtime |
| **Member Onboarding** | Step-by-step for admins: create user → send invite → member accepts → sets password + optional 2FA |
| **Password Reset Flow** | What happens end-to-end when a member forgets their password; SMTP dependency |
| **2FA Enrollment & Recovery** | How TOTP enrollment works, what to do if a member loses their authenticator |
| **Passkey Setup** | WebAuthn environment requirements (RP_ID must match domain), registration flow |
| **Object Storage** | How uploaded documents are stored, the signed-URL lifecycle, public vs. private bucket structure |
| **Audit Log Interpretation** | Full list of `action` enum values in `audit_logs`, what triggers each, how to read the `detail` JSON |
| **Email Configuration** | SMTP vs. env-var config precedence, how to test (using the SMTP test endpoint), troubleshooting |
| **Session & Security Config** | Session timeout, cookie settings, 2FA enforcement by role, CORS origins, rate limits |
| **Database Backup & Restore** | Not mentioned anywhere |

---

### 2.8 Frontend Component Documentation

**Finding:** 37 of 39 portal page files have zero JSDoc. Complex UI flows have no documentation.

**High-complexity pages with no comments:**
- `setup.tsx` — multi-step bootstrap wizard with race-condition handling (noted in code, not documented)
- `accept-invitation.tsx` — invitation token validation, password setting flow
- `documents-folder.tsx` — folder hierarchy navigation, upload flow, access-gated rendering
- `admin/users.tsx` — 7-tab detail sheet, create/delete/deactivate flows
- `history/*.tsx` — rich text editor, timeline, section reorder drag-and-drop

**Missing:** At minimum, a component map showing which pages exist, what role/level is required to see them, and which API endpoints they consume.

---

### 2.9 replit.md — Quick-Start File

**Finding:** The `replit.md` file is almost entirely unpopulated boilerplate. Every major section contains placeholder text.

**Sections that need content:**

| Section | Status | What Should Be There |
|---------|--------|---------------------|
| Project name/description | ❌ Placeholder | "Pershing No. 307 Member Portal — private membership portal for a Masonic lodge" |
| Where things live | ❌ Placeholder | Repo map: routes, schema, pages, lib, config |
| Architecture decisions | ❌ Placeholder | Numeric permission levels, silent-filter access control, lodge-agnostic DB design, session-based auth |
| Product | ❌ Placeholder | Feature list: auth, document vault, events, history, audit, reports |
| User preferences | ❌ Placeholder | Any conventions established during development |
| Gotchas | ❌ Placeholder | "Run `npx tsc --build` after codegen", "Drizzle null-set bug on nullable FKs" |

---

## 3. Priority Matrix

| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| OpenAPI spec — missing endpoints | High | Medium | 🔴 P1 |
| OpenAPI spec — security declarations | High | Low | 🔴 P1 |
| Environment variables reference | High | Low | 🔴 P1 |
| Permission level system doc | High | Low | 🔴 P1 |
| Operational runbooks (Bootstrap, Deploy) | High | Medium | 🔴 P1 |
| Document access control explanation | High | Medium | 🔴 P1 |
| replit.md — populate all sections | Medium | Low | 🟡 P2 |
| OpenAPI spec — error responses | Medium | High | 🟡 P2 |
| Route file JSDoc (high-complexity routes) | Medium | Medium | 🟡 P2 |
| DB schema column comments | Medium | Medium | 🟡 P2 |
| Audit log action enum reference | Medium | Low | 🟡 P2 |
| `.env.example` file | Medium | Low | 🟡 P2 |
| Frontend component map | Low | Low | 🟢 P3 |
| Route file JSDoc (low-complexity routes) | Low | High | 🟢 P3 |
| Package-level README files | Low | Low | 🟢 P3 |

---

## 4. Recommended Actions

### Immediate (P1 — low effort, high value)

1. **Add missing OpenAPI endpoints** — add the ~13 missing operations, focusing on 2FA, profile, and passkey authentication endpoints.
2. **Add `security:` to all OpenAPI operations** — mark each operation with the correct permission requirement (public / requireAuth / requireRole(level)).
3. **Create `.env.example`** — one file at the repo root listing all 20 variables with type, required/optional flag, and one-line description.
4. **Add `PERMISSION_MODEL.md`** — document the four numeric levels, which middleware enforces them, and the PM Super distinction.
5. **Populate `replit.md`** — fill in Product, Architecture decisions, Where things live, Gotchas sections.

### Short-term (P2 — medium effort, medium value)

6. **Add JSDoc to the 8 high-complexity route files** — `auth.ts`, `users.ts`, `documents.ts`, `document-domains.ts`, `passkeys.ts`, `two-factor.ts`, `bootstrap.ts`, `config-admin.ts`. Focus on: purpose, required permission level, business rules, audit-log side effects.
7. **Add column comments to the 10 most complex schema tables** — `users`, `document_folders`, `folder_access_matrix`, `protected_domains`, `configuration`, `invitations`, `audit_logs`.
8. **Write Bootstrap & Deployment runbooks** — these are needed before any production go-live.
9. **Write Document Access Control guide** — explain the domain/matrix/protection-level system with a diagram.
10. **Document all OpenAPI error responses** — at minimum add 401/403/404 to every protected operation.

### Longer-term (P3 — lower urgency)

11. Add JSDoc to remaining route files.
12. Create a frontend component map (which pages exist, required level, consumed endpoints).
13. Add `README.md` to each workspace package (`api-server`, `portal`, `lib/db`, `lib/api-spec`).
14. Add operational runbooks for remaining flows (email config, passkey, 2FA recovery, backup/restore).

---

## 5. Metrics Summary

| Metric | Current | Target |
|--------|---------|--------|
| OpenAPI endpoint coverage | ~92% (147/160+) | 100% |
| OpenAPI security declarations | 39% (58/147) | 100% |
| Route files with JSDoc | 7% (2/27) | 100% |
| Schema files with column comments | 0% (0/31) | 80% |
| Env vars documented | 25% (5/20) | 100% |
| Operational runbooks | 0/10 needed | 10/10 |
| replit.md sections populated | 15% (1/7 sections) | 100% |

---

*Generated by documentation gap analysis scan — June 22, 2026*
