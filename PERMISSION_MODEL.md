# Permission Model — Pershing No. 307 Member Portal

## Overview

Access control uses a **numeric permission level** attached to each user's role.
Every protected endpoint declares a minimum level; the server resolves the
user's highest level at request time and compares it to that threshold.

This design allows a single middleware (`requireRole(minLevel)`) to enforce
any access boundary without enumerating role names and without maintaining a
role-to-route mapping table.

---

## The Four Levels

| Constant | Value | Display Name | Who holds it |
|----------|-------|--------------|--------------|
| `VISITOR_LEVEL` | **10** | Visitor | A user whose invitation has been created but who has not yet accepted it. Read-only access to public lodge content. |
| `MEMBER_LEVEL` | **20** | Member | A fully onboarded lodge member. Can view all non-restricted content and manage their own profile. |
| `SITE_ADMIN_LEVEL` | **80** | Site Administrator | Lodge secretary or designated admin. Full management access: members, documents, events, config. |
| `PM_SUPER_LEVEL` | **90** | PM Super Admin | Past Master with elevated access. All admin capabilities plus access to PM-protected document domains. |

> **Why 10 / 20 / 80 / 90?** The gaps are intentional so future intermediate
> levels (e.g. 30 = Committee Chair, 70 = Junior Warden) can be inserted without
> renumbering existing roles.

---

## Middlewares

### `requireAuth()`

Defined in `artifacts/api-server/src/middlewares/requireAuth.ts`.

- Returns `401` if `req.session.userId` is missing (unauthenticated request).
- Returns `401` with `reason: "force_logout"` if the session has been
  flagged `forceLogout: true` (set when an admin deactivates the user or
  changes their role). The session is destroyed server-side.
- Sets `Cache-Control: no-store` headers on every response that passes
  authentication.

Use on **any route that requires a logged-in user** regardless of level.

```ts
router.get("/my-endpoint", requireAuth(), async (req, res) => { … });
```

### `requireRole(minLevel: number)`

Defined in `artifacts/api-server/src/middlewares/requireRole.ts`.

- Implicitly calls the same session check as `requireAuth()` — returns `401`
  if no session.
- Queries `user_roles → roles` to find the user's **highest** permission level.
- Returns `403` if `maxLevel < minLevel`.
- Attaches `req.userPermissionLevel = maxLevel` so handlers can do
  finer-grained checks (e.g. "admins see all, members see only their own").

Always pair with `requireAuth()` in front of it:

```ts
router.get("/admin-thing", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => { … });
```

### `requireDomain(domainId)`

Defined in `artifacts/api-server/src/middlewares/requireDomain.ts`.

Used for document domains that have a `domainProtectionLevel` requiring
explicit per-user grants. Site Admins (≥ 80) bypass the domain check.
PM-protected domains require PM_SUPER_LEVEL (90) or an explicit grant
row in `user_domain_access`.

### `require2FA()`

Defined in `artifacts/api-server/src/middlewares/require2FA.ts`.

Applied to sensitive operations when the admin has configured
`require_2fa_roles` in the configuration table. Redirects to the 2FA
prompt if the user's session does not have `twoFactorVerified: true`.

---

## Per-Endpoint Permission Map

### Public (no session required)

| Endpoint | Notes |
|----------|-------|
| `GET /api/healthz` | Health check |
| `GET /api/auth/app-policy` | Password policy + passkeys flag |
| `POST /api/auth/login` | Credentials login |
| `POST /api/auth/login/2fa` | 2FA step-up after password login |
| `POST /api/auth/forgot-password` | Password reset request |
| `POST /api/auth/reset-password` | Password reset via token |
| `GET /api/auth/accept-invitation/:token` | Invitation token validation |
| `POST /api/auth/accept-invitation` | Invitation acceptance |
| `GET /api/bootstrap/status` | Bootstrap check |
| `POST /api/bootstrap` | First-run setup (locked after completion) |
| `POST /api/passkeys/authentication/begin` | Passkey auth challenge |
| `POST /api/passkeys/authentication/complete` | Passkey auth verify |

### Auth-only (any logged-in user, level ≥ 1)

| Endpoint | Notes |
|----------|-------|
| `POST /api/auth/logout` | |
| `GET /api/auth/me` | Current user info |
| `GET /api/auth/2fa/status` | Own 2FA status |
| `POST /api/auth/2fa/enroll` | Begin TOTP enrollment |
| `POST /api/auth/2fa/verify-enroll` | Complete TOTP enrollment |
| `DELETE /api/auth/2fa` | Remove own 2FA |
| `GET /api/passkeys` | Own passkeys list |
| `POST /api/passkeys/registration/begin` | Begin passkey registration |
| `POST /api/passkeys/registration/complete` | Complete passkey registration |
| `DELETE /api/passkeys/:id` | Remove own passkey |
| `GET /api/degree-definitions` | Masonic degree reference list |

### Visitor (≥ 10)

| Endpoint | Notes |
|----------|-------|
| `GET /api/events/upcoming` | |
| `GET /api/roadmap` | Public roadmap |
| `GET /api/history/page` | Lodge history page |
| `GET /api/history/timeline` | Lodge timeline |
| `GET /api/tracing-board/upcoming` | |
| `GET /api/birthdays/upcoming` | Birthday-visibility rules apply |

### Member (≥ 20)

| Endpoint | Notes |
|----------|-------|
| `GET/PATCH /api/profile/date-of-birth` | Own DOB only |
| `GET/PATCH /api/profile/birthday-visibility` | Own visibility only |
| `GET /api/documents` | Silent-filter by folder access matrix |
| `POST /api/documents/request-upload` | |
| `GET /api/documents/:id/view` | Signed URL for viewing |
| `GET /api/documents/:id/download` | Signed URL for download |
| `GET /api/document-folders` | Filtered by domain access |
| `GET /api/events/upcoming` | (same as Visitor but included here for clarity) |
| `GET /api/birthdays/upcoming` | Filtered by birthday-visibility setting |

### Site Admin (≥ 80)

All member-level endpoints plus:

| Area | Endpoints |
|------|-----------|
| Users | Full CRUD, roles, degrees, deactivation, passkeys admin view |
| Invitations | Create, list, revoke |
| Documents | PATCH status, PATCH metadata, review queue |
| Document folders | Create, rename, delete, assign domain |
| Document domains | Create, list, get, update, delete |
| Document review | List pending, count, approve/reject |
| Events | Create, update, delete |
| Tracing board | Create, update, delete |
| History | Section CRUD, reorder, documents, timeline, bio |
| Roadmap | Create, update, delete, reorder |
| Lodge years | Create, update, activate, archive, restore, delete |
| Roles | Create, list, assign, revoke |
| Config | Read/write all config keys, SMTP test |
| Audit log | Read |
| Reports | Onboarding report |
| Storage | Object metadata |

### PM Super (≥ 90)

All Site Admin capabilities plus:

| Endpoint | Notes |
|----------|-------|
| `PATCH /api/document-domains/:id/access` | Set `domainProtectionLevel` |
| `GET/PUT /api/document-domains/:id/access-matrix` | Full matrix read/write |
| `POST /api/document-folders/:id/subfolders` | Create PM-protected subfolders |
| `PATCH /api/document-folders/:id/domain` | Assign folder to PM domain |
| `POST /api/document-notice` | Create/update lodge-wide document notice |

---

## Adding a New Route

1. Choose the correct minimum level from the table above.
2. Import the constant from the top of the route file (e.g. `const SITE_ADMIN_LEVEL = 80`).
3. Chain `requireAuth(), requireRole(SITE_ADMIN_LEVEL)` in the route definition.
4. Add a corresponding test in `artifacts/api-server/test/authorization.test.ts`
   in the appropriate section (§3–§6).
5. Add the endpoint to `lib/api-spec/openapi.yaml` with a `security: - cookieAuth: []`
   declaration.

---

## Cross-User Isolation

Some endpoints are available to any authenticated user but are **scoped to
the requesting user's own data**. The handler checks `req.session.userId`
against the resource owner and returns `403` if they differ:

- `GET /api/users/:id` — members can read their own record; admins can read any
- `PATCH /api/users/:id` — members can update their own record; admins can update any
- `GET/PATCH /api/profile/*` — always own data only
- `GET /api/passkeys` — own passkeys only

---

*See also: `TECHNICAL_ARCHITECTURE.md` (auth flow), `DATABASE_DESIGN.md` (roles + user_roles tables)*
