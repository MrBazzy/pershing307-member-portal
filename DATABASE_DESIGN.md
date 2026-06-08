# Database Design — Pershing307 Member Portal

## Design Principles

1. **Lodge-agnostic engine** — all lodge-specific data in tables, never in code
2. **Soft deletes** — users deactivated, not deleted (audit trail preservation)
3. **Audit everything** — all sensitive operations append a row to `audit_logs`
4. **Roles are data** — no role names hardcoded in application code
5. **Configurable** — thresholds, messages, branding all in `configuration` table

---

## Schema Overview

```
lodges ◄────────────────────────────────────────────────┐
   │                                                     │
   ├──► configuration (k/v per lodge)                   │
   ├──► roles (configurable role definitions)            │
   ├──► protected_domains                                │
   ├──► users                                            │
   │       ├──► user_roles (many-to-many)                │
   │       ├──► user_degrees                             │
   │       ├──► user_domain_access (many-to-many)        │
   │       ├──► invitations                              │
   │       ├──► password_reset_tokens                    │
   │       └──► two_factor_settings                      │
   ├──► sessions                                         │
   └──► audit_logs                                       │
```

---

## Tables

### `lodges`

Supports future multi-lodge installations. Sprint 1 has exactly one lodge.

```sql
CREATE TABLE lodges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  number      TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `configuration`

Key-value store for all configurable lodge settings.

```sql
CREATE TABLE configuration (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lodge_id    UUID NOT NULL REFERENCES lodges(id),
  key         TEXT NOT NULL,
  value       TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lodge_id, key)
);
```

**Sprint 1 seed values:**

| key                   | description                              |
|-----------------------|------------------------------------------|
| `lodge_name`          | Full lodge name                          |
| `lodge_number`        | Lodge number                             |
| `timezone`            | IANA timezone string                     |
| `session_timeout_min` | Session idle timeout in minutes          |
| `lockout_max_attempts`| Failed attempts before lockout           |
| `lockout_duration_min`| Lockout duration in minutes              |
| `invite_expiry_days`  | Days before invitation expires           |
| `reset_expiry_hours`  | Hours before password reset link expires |
| `smtp_host`           | SMTP server hostname                     |
| `smtp_port`           | SMTP port                                |
| `smtp_user`           | SMTP username                            |
| `smtp_from_name`      | Display name for outbound email          |
| `smtp_from_email`     | From address for outbound email          |
| `require_2fa_roles`   | Comma-separated role names requiring 2FA |

---

### `roles`

All roles are database rows. No role names exist in code.

```sql
CREATE TABLE roles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lodge_id         UUID NOT NULL REFERENCES lodges(id),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  permission_level INTEGER NOT NULL DEFAULT 10,
  description      TEXT,
  is_system        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lodge_id, slug)
);
```

**Sprint 1 seed roles:**

| slug                     | name                    | level |
|--------------------------|-------------------------|-------|
| `visitor`                | Visitor                 | 10    |
| `member`                 | Member                  | 20    |
| `secretary`              | Secretary               | 30    |
| `treasurer`              | Treasurer               | 30    |
| `junior-warden`          | Junior Warden           | 40    |
| `senior-warden`          | Senior Warden           | 50    |
| `worshipful-master`      | Worshipful Master       | 60    |
| `administrator`          | Administrator           | 70    |
| `site-administrator`     | Site Administrator      | 80    |
| `pm-super-administrator` | PM Super Administrator  | 90    |

---

### `protected_domains`

Configurable domains that restrict content access beyond ordinary role checks.

```sql
CREATE TABLE protected_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lodge_id    UUID NOT NULL REFERENCES lodges(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lodge_id, slug)
);
```

**Sprint 1 seed domains:** `members`, `officers`, `administration`, `financial`, `past-masters`

---

### `users`

Core user record. Never hard-deleted — use `is_active = false`.

```sql
CREATE TABLE users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lodge_id                 UUID NOT NULL REFERENCES lodges(id),
  email                    TEXT NOT NULL,
  email_verified           BOOLEAN NOT NULL DEFAULT false,
  password_hash            TEXT,
  first_name               TEXT NOT NULL,
  last_name                TEXT NOT NULL,
  display_name             TEXT,
  membership_status        TEXT NOT NULL DEFAULT 'pending',
  is_active                BOOLEAN NOT NULL DEFAULT false,
  is_bootstrap_admin       BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts    INTEGER NOT NULL DEFAULT 0,
  locked_until             TIMESTAMPTZ,
  last_login_at            TIMESTAMPTZ,
  last_login_ip            TEXT,
  password_changed_at      TIMESTAMPTZ,
  must_change_password     BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lodge_id, email)
);
```

**`membership_status` values:** `pending`, `entered-apprentice`, `fellow-craft`, `master-mason`, `suspended`, `demitted`, `deceased`

---

### `user_roles`

Many-to-many: users to roles.

```sql
CREATE TABLE user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  role_id     UUID NOT NULL REFERENCES roles(id),
  granted_by  UUID REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);
```

---

### `user_degrees`

Masonic degree progression log.

```sql
CREATE TABLE user_degrees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  degree        INTEGER NOT NULL,
  conferred_on  DATE,
  lodge_id      UUID REFERENCES lodges(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `user_domain_access`

Grants a user access to a protected domain (beyond their role level).

```sql
CREATE TABLE user_domain_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  domain_id   UUID NOT NULL REFERENCES protected_domains(id),
  granted_by  UUID REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain_id)
);
```

---

### `invitations`

Tracks all pending and consumed invitations.

```sql
CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lodge_id        UUID NOT NULL REFERENCES lodges(id),
  email           TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  invited_by      UUID NOT NULL REFERENCES users(id),
  role_id         UUID REFERENCES roles(id),
  accepted_at     TIMESTAMPTZ,
  accepted_by_user UUID REFERENCES users(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `password_reset_tokens`

Single-use, time-limited password reset tokens.

```sql
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  token       TEXT NOT NULL UNIQUE,
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `two_factor_settings`

TOTP configuration per user. Secret is encrypted at rest (future enhancement: use KMS).

```sql
CREATE TABLE two_factor_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id),
  totp_secret       TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT false,
  backup_codes      TEXT[],
  enrolled_at       TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### `sessions`

Server-side session store. Used by `express-session` with a Postgres store adapter.

```sql
CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,
  sess    JSONB NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_expire ON sessions(expire);
```

---

### `audit_logs`

Append-only log. Application code never updates or deletes rows here.

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lodge_id    UUID REFERENCES lodges(id),
  actor_id    UUID REFERENCES users(id),
  actor_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

**Sprint 1 audit actions:**

| action                       | description                               |
|------------------------------|-------------------------------------------|
| `LOGIN`                      | Successful login                          |
| `LOGIN_2FA`                  | Successful 2FA completion                 |
| `LOGIN_FAILED`               | Failed login attempt                      |
| `LOGIN_LOCKED`               | Account locked after too many failures    |
| `LOGOUT`                     | User logged out                           |
| `PASSWORD_RESET_REQUESTED`   | Reset email sent                          |
| `PASSWORD_RESET_COMPLETED`   | Password successfully changed via reset   |
| `PASSWORD_CHANGED`           | Password changed by user                  |
| `INVITATION_CREATED`         | Admin created an invitation               |
| `INVITATION_ACCEPTED`        | User accepted invitation and set password |
| `INVITATION_REVOKED`         | Admin revoked a pending invitation        |
| `ROLE_GRANTED`               | Role assigned to user                     |
| `ROLE_REVOKED`               | Role removed from user                    |
| `USER_ACTIVATED`             | User account activated                    |
| `USER_DEACTIVATED`           | User account deactivated                  |
| `BOOTSTRAP_COMPLETED`        | Bootstrap wizard completed                |
| `CONFIG_CHANGED`             | Configuration value changed               |

---

## Indexes

Key indexes beyond primary keys:

```sql
-- Users
CREATE INDEX idx_users_email ON users(lodge_id, email);
CREATE INDEX idx_users_active ON users(lodge_id, is_active);

-- Invitations
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(lodge_id, email);

-- Password resets
CREATE INDEX idx_password_reset_token ON password_reset_tokens(token);

-- Audit
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

---

## Migration Strategy

Drizzle ORM manages migrations. All schema changes go through `drizzle-kit`:

```bash
# Generate migration file from schema changes
pnpm --filter @workspace/db run generate

# Push to development database
pnpm --filter @workspace/db run push

# In production: apply migrations via CI/CD or manual runbook
pnpm --filter @workspace/db run migrate
```

Migration files are committed to version control and never deleted.
