---
name: Pershing307 Sprint 2A and later
description: Birthday Calendar, Roadmap Box, Audit Log improvements — what was built and key decisions
---

## Completed features

### Birthday Calendar (Sprint 2A)
- Added upcoming birthdays widget to dashboard
- DB: DOB stored in users table; birthday API filters within next 30 days

### Roadmap Box (Sprint 2A)
- Dashboard roadmap summary widget
- Uses lodge-year + roadmap-item data

### DOB Edit (pending)
- Admin/users DOB edit UI — NOT YET implemented (noted in Sprint 2A)

### Audit Log enhancements (AUDIT-LOG-001)
- Complete rewrite of `artifacts/portal/src/pages/admin/audit-log.tsx`
- Pure frontend interpretation layer — no backend changes needed
- `interpret(action, detail, actorEmail, targetId)` → { category, result, summary, details?, recommendation? }
- Covers all ~105 AuditAction types across 14 categories
- Known detail payloads decoded: LOGIN_FAILED reasons, PASSKEY_LOGIN_FAILED reasons,
  TOTP_FAILED attempt counts, ROLE_GRANTED roleName, INVITATION_CREATED name+email, etc.
- Filters: actor email (server-side, debounced), category (client-side), result success/failure
  (client-side), date range from/to (server-side)
- Fetch 500 server-side; display 50 at a time with "Show more"

**Why no backend changes:** The existing API already returns the full `detail` jsonb column
and supports actorEmail/from/to/action filter params. The interpretation layer is entirely
frontend-safe — adding it there avoids OpenAPI changes and codegen runs.

## Key file
- `artifacts/portal/src/pages/admin/audit-log.tsx` — full page + interpret() function
