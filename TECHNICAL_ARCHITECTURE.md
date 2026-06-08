# Technical Architecture — Pershing307 Member Portal

## Overview

The Pershing307 Member Portal is a secure, multi-lodge-capable web application for Masonic Lodge administration. It is built for longevity, maintainability, and operation by non-technical administrators.

---

## Application Architecture

### Deployment Topology

```
Browser (HTTPS)
    │
    ▼
Reverse Proxy / TLS Termination (Nginx or Caddy)
    │
    ├──► React + Vite Frontend (static files, served by proxy)
    │
    └──► Express API Server (Node.js, port assigned by environment)
              │
              ▼
         PostgreSQL Database
```

### Monorepo Structure

This project lives in a pnpm workspace monorepo:

```
/
├── artifacts/
│   ├── api-server/        ← Express backend (REST API)
│   └── portal/            ← React + Vite frontend
├── lib/
│   ├── db/                ← Drizzle ORM schema + database connection
│   ├── api-spec/          ← OpenAPI specification (source of truth)
│   ├── api-client-react/  ← Generated React Query hooks (from OpenAPI)
│   └── api-zod/           ← Generated Zod validators (from OpenAPI)
└── docs/                  ← All documentation
```

---

## Technology Stack

| Layer            | Technology              | Version  |
|------------------|-------------------------|----------|
| Frontend         | React + Vite            | React 19 |
| Styling          | Tailwind CSS            | v4       |
| Backend          | Express 5               | 5.x      |
| Runtime          | Node.js                 | 24       |
| Language         | TypeScript              | 5.9      |
| Database         | PostgreSQL               | 16+      |
| ORM              | Drizzle ORM             | latest   |
| Validation       | Zod                     | v4       |
| API Codegen      | Orval (from OpenAPI)    | latest   |
| Password Hashing | Argon2                  | latest   |
| Sessions         | express-session + pg    | latest   |
| 2FA              | speakeasy (TOTP)        | latest   |

---

## Authentication Architecture

### Session-Based Authentication

Authentication uses **server-side sessions** stored in PostgreSQL (not JWTs). This was chosen because:

- Sessions can be invalidated server-side instantly (critical for security incidents)
- No token refresh complexity
- Simpler CSRF protection
- Audit logging is straightforward

### Authentication Flow

```
1. POST /api/auth/login
   → Validate credentials (email + password)
   → Check account lockout status
   → Verify Argon2 password hash
   → If 2FA required: return { requiresTwoFactor: true, tempToken }
   → Else: create session, set HttpOnly cookie
   → Log LOGIN event to audit_logs

2. POST /api/auth/login/2fa
   → Validate tempToken
   → Verify TOTP code
   → Create session, set HttpOnly cookie
   → Log LOGIN_2FA event

3. POST /api/auth/logout
   → Destroy session
   → Clear cookie
   → Log LOGOUT event

4. POST /api/auth/forgot-password
   → Generate time-limited reset token (1 hour)
   → Send email with reset link
   → Log PASSWORD_RESET_REQUESTED

5. POST /api/auth/reset-password
   → Validate token (not expired, not used)
   → Hash new password with Argon2
   → Invalidate all existing sessions for user
   → Log PASSWORD_RESET_COMPLETED
```

### Invitation Flow

```
Admin creates user record (no password set)
    → invitation_token generated (UUID, 7-day expiry)
    → Email sent with invitation link
    → User visits /accept-invitation?token=...
    → User sets password, accepts terms
    → Account activated
    → Invitation marked as used
    → Log INVITATION_ACCEPTED
```

### Session Security

- Sessions stored server-side in `sessions` table
- Cookie: `HttpOnly`, `Secure` (in production), `SameSite=Strict`
- Session timeout: configurable (default 8 hours)
- Absolute session timeout: 24 hours regardless of activity
- Session regeneration on privilege escalation

---

## Authorization Architecture

### Deny-By-Default Model

**All routes are denied unless explicitly permitted.** Middleware enforces this:

```typescript
// Every protected route must pass requireAuth() + requireRole()
router.get('/api/members', requireAuth(), requireRole('member'), handler);
```

### Role Hierarchy

Roles are stored in the database — none are hardcoded. The `roles` table defines all roles and their `permission_level` (numeric priority for hierarchy checks).

Initial roles (seeded, not hardcoded):

| Role                    | Level |
|-------------------------|-------|
| Visitor                 | 10    |
| Member                  | 20    |
| Secretary               | 30    |
| Treasurer               | 30    |
| Junior Warden           | 40    |
| Senior Warden           | 50    |
| Worshipful Master       | 60    |
| Administrator           | 70    |
| Site Administrator      | 80    |
| PM Super Administrator  | 90    |

### Protected Domains

Protected domains are stored in configuration — not hardcoded. A user must hold a role that has explicit access to a domain to view domain-restricted content.

Initial protected domains: Members, Officers, Administration, Financial, Past Masters.

### Middleware Stack

```
Request
  │
  ├── requireAuth()       → 401 if no valid session
  ├── requireRole(role)   → 403 if insufficient role level
  ├── requireDomain(dom)  → 403 if not in protected domain
  └── Handler
```

### 2FA Enforcement

PM Super Administrators and Site Administrators are required to complete TOTP setup before accessing protected resources. Middleware checks `two_factor_enabled` and redirects to setup if missing.

---

## Database Architecture

See `DATABASE_DESIGN.md` for full schema documentation.

### Key Design Principles

1. **No hardcoded lodge data** — lodge name, number, timezone, branding all in `configuration` table
2. **Roles are data** — stored in `roles` table, never in code constants
3. **All sensitive operations are logged** — `audit_logs` table, append-only by application
4. **Soft deletes** — users are deactivated, never hard-deleted (audit trail preservation)
5. **Multi-lodge ready** — `lodge_id` foreign key on every lodge-specific table

---

## Security Model

### Defence in Depth

| Layer               | Control                                          |
|---------------------|--------------------------------------------------|
| Network             | TLS termination at proxy, HTTPS enforced         |
| Application         | CSRF tokens, XSS sanitization, Helmet.js headers |
| Session             | HttpOnly cookies, server-side session store      |
| Authentication      | Argon2 password hashing, account lockout         |
| Authorization       | Deny-by-default, RBAC, protected domains         |
| Data                | Drizzle ORM (parameterised queries, no raw SQL)  |
| Audit               | All sensitive actions logged with actor + IP     |

### Account Lockout

After 5 consecutive failed login attempts:
- Account is locked for 15 minutes (configurable)
- Administrator is notified (future sprint)
- Lockout logged to `audit_logs`

### Password Policy

Enforced server-side via Zod:
- Minimum 12 characters
- At least one uppercase, one lowercase, one digit, one symbol
- Checked against common password list (future sprint)

### CSRF Protection

All state-changing API endpoints require a CSRF token (double-submit cookie pattern). GET requests are exempt.

### Security Headers

Helmet.js applied globally:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

---

## Multi-Lodge Architecture

The system separates **portal engine** from **lodge configuration**:

- Lodge-specific data (name, number, branding, roles, domains) lives in database tables
- The codebase contains zero lodge-specific strings
- A new lodge is bootstrapped by running the Bootstrap Wizard and seeding configuration
- Future: a `lodges` table enables a single installation to serve multiple lodges

---

## Configuration Management

All configurable values live in the `configuration` table:

```
key               | value
------------------|--------------------------
lodge_name        | "General John J. Pershing Lodge No. 307"
lodge_number      | "307"
timezone          | "America/Chicago"
session_timeout   | "480"
lockout_attempts  | "5"
lockout_minutes   | "15"
invite_expiry_days| "7"
smtp_host         | "..."
smtp_port         | "587"
```

---

## Continuity Principles

1. **Documentation is generated alongside code** — not as an afterthought
2. **No magic numbers** — all thresholds are in the `configuration` table
3. **Dependency versions are pinned** — `pnpm-lock.yaml` committed
4. **Database migrations are versioned** — Drizzle migration files committed
5. **Secrets are environment variables** — never committed to source control
6. **README includes runbook** — a new administrator can get running without reading all docs

---

## Future Developer Guide

### Adding a New Route

1. Define the endpoint in `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen`
3. Implement the handler in `artifacts/api-server/src/routes/`
4. Apply appropriate middleware: `requireAuth()`, `requireRole()`, `requireDomain()`
5. Log sensitive operations to `audit_logs`

### Adding a New Role

Insert a row into the `roles` table. No code change required.

### Adding a New Configuration Setting

Insert a row into the `configuration` table. Read it via `getConfig(key)` helper.

### Changing Branding (Sprint 2+)

Update the `configuration` table via the Site Administrator UI. No code change required.
