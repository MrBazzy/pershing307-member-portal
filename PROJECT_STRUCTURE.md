# Project Structure — Pershing307 Member Portal

## Repository Layout

```
/
├── artifacts/
│   ├── api-server/                  ← Express REST API backend
│   │   └── src/
│   │       ├── index.ts             ← Server entry point
│   │       ├── app.ts               ← Express app setup, middleware
│   │       ├── lib/
│   │       │   ├── logger.ts        ← Pino structured logger
│   │       │   ├── config.ts        ← Runtime config reader (reads DB)
│   │       │   ├── email.ts         ← Email sending (nodemailer)
│   │       │   ├── crypto.ts        ← Token generation helpers
│   │       │   └── audit.ts         ← Audit log writer
│   │       ├── middlewares/
│   │       │   ├── requireAuth.ts   ← 401 if no valid session
│   │       │   ├── requireRole.ts   ← 403 if insufficient role
│   │       │   ├── requireDomain.ts ← 403 if not in protected domain
│   │       │   ├── require2FA.ts    ← Enforce 2FA for high-privilege roles
│   │       │   └── csrf.ts          ← CSRF token validation
│   │       └── routes/
│   │           ├── index.ts         ← Router aggregator
│   │           ├── health.ts        ← GET /api/healthz
│   │           ├── auth.ts          ← Login, logout, forgot/reset password
│   │           ├── invitations.ts   ← Create, accept, revoke invitations
│   │           ├── users.ts         ← User management (admin)
│   │           ├── bootstrap.ts     ← Bootstrap wizard endpoint
│   │           └── audit.ts         ← Audit log viewer (admin)
│   │
│   └── portal/                      ← React + Vite frontend
│       └── src/
│           ├── main.tsx             ← React entry point
│           ├── App.tsx              ← Router setup
│           ├── index.css            ← Tailwind CSS + theme tokens
│           ├── lib/
│           │   ├── api.ts           ← Fetch wrapper (credentials: include)
│           │   └── auth.ts          ← Auth context + hooks
│           ├── components/
│           │   ├── ui/              ← shadcn/ui primitives
│           │   ├── Layout.tsx       ← Shell, nav, sidebar
│           │   ├── ProtectedRoute.tsx
│           │   └── RoleGate.tsx     ← Conditional render by role
│           └── pages/
│               ├── Login.tsx
│               ├── ForgotPassword.tsx
│               ├── ResetPassword.tsx
│               ├── AcceptInvitation.tsx
│               ├── SetupTwoFactor.tsx
│               ├── Bootstrap.tsx    ← First-run wizard
│               ├── Dashboard.tsx    ← Home after login
│               ├── admin/
│               │   ├── Users.tsx
│               │   ├── Invitations.tsx
│               │   └── AuditLog.tsx
│               └── NotFound.tsx
│
├── lib/
│   ├── api-spec/
│   │   └── openapi.yaml             ← API contract (source of truth)
│   ├── api-client-react/
│   │   └── src/generated/           ← Auto-generated React Query hooks
│   ├── api-zod/
│   │   └── src/generated/           ← Auto-generated Zod schemas
│   └── db/
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts             ← DB connection pool export
│           └── schema/
│               ├── index.ts         ← Re-exports all tables
│               ├── lodges.ts
│               ├── configuration.ts
│               ├── roles.ts
│               ├── protected-domains.ts
│               ├── users.ts
│               ├── user-roles.ts
│               ├── user-degrees.ts
│               ├── user-domain-access.ts
│               ├── invitations.ts
│               ├── password-reset-tokens.ts
│               ├── two-factor-settings.ts
│               ├── sessions.ts
│               └── audit-logs.ts
│
├── docs/
│   ├── README.md
│   ├── INSTALLATION_GUIDE.md
│   ├── USER_GUIDE.md
│   ├── ADMINISTRATOR_GUIDE.md
│   ├── TECHNICAL_ARCHITECTURE.md    ← This file
│   ├── PROJECT_STRUCTURE.md
│   └── DATABASE_DESIGN.md
│
├── scripts/
│   ├── seed.ts                      ← Seeds initial lodge, roles, domains
│   └── post-merge.sh
│
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## Key Conventions

### File Naming

- `kebab-case` for all files and directories
- Schema files named after their table: `audit-logs.ts` → `audit_logs` table
- Route files named after their resource: `invitations.ts` → `/api/invitations`

### Import Paths

- Backend imports DB from `@workspace/db`
- Backend imports Zod schemas from `@workspace/api-zod`
- Frontend imports API hooks from `@workspace/api-client-react`
- Never import across artifact boundaries directly

### Environment Variables

Required at runtime:

| Variable         | Description                          |
|------------------|--------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string         |
| `SESSION_SECRET` | Random 64+ character string          |
| `PORT`           | Port for the API server              |
| `NODE_ENV`       | `development` or `production`        |
| `SMTP_PASS`      | SMTP password (never in database)    |

Optional:

| Variable              | Description                        |
|-----------------------|------------------------------------|
| `ALLOWED_ORIGINS`     | Comma-separated CORS origins       |
| `LOG_LEVEL`           | `debug`, `info`, `warn`, `error`   |

### Secrets Management

- `SESSION_SECRET` and `SMTP_PASS` are environment variables only — never in the database
- All other SMTP settings are in the `configuration` table (non-secret)
- Never commit `.env` files

---

## Sprint 1 Scope vs Future Sprints

### Sprint 1 (this build)

- Database schema (all tables)
- Express API server with auth routes
- Session management
- Invitation flow (backend)
- Password reset flow (backend)
- Role-based authorization middleware
- Audit logging
- Bootstrap wizard (backend)
- Basic frontend: Login, Forgot Password, Accept Invitation, Bootstrap pages
- Admin pages: Users list, Invitations, Audit Log

### Sprint 2 (not built yet)

- Member profiles
- Profile photos (object storage)
- Member directory
- Birthday calendar
- Masonic anniversary recognition

### Sprint 3+ (not built yet)

- Full branding / theming system
- Quote of the Day
- Memorial banner system
- Roadmap page
- Help system
- Portal health dashboard
- Dark mode
