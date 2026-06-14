---
name: Pershing307 Sprint 2A
description: Birthday Calendar and Roadmap Box — what was built and what remains.
---

## Birthday Calendar
- `date_of_birth date` column added to `users` table (nullable).
- `GET /api/birthdays/upcoming` — next 30 days, all authenticated users.
- `GET /api/birthdays` — all birthdays grouped by month, authenticated.
- `PATCH /api/users/:id/date-of-birth` — Site Admin only, audits `DOB_UPDATED`.
- Portal: `/birthdays` full calendar page; "Upcoming Birthdays" dashboard widget (all users).
- Nav: "Birthdays" (Cake icon) visible to all authenticated users.

## Roadmap Box
- `roadmap_items` table: id, lodge_id, title, description, status (text), sort_order, is_visible, created_by, created_at, updated_at.
- Status values: `planned` | `in-progress` | `completed` | `future-idea`.
- `GET /api/roadmap` — members see only `is_visible=true`; admins (≥80) see all.
- `POST /api/roadmap`, `PUT /api/roadmap/:id`, `DELETE /api/roadmap/:id`, `POST /api/roadmap/reorder` — Site Admin only.
- Portal: "Coming Next" dashboard widget (all users); `/admin/roadmap` CRUD page (admin only).
- Nav: "Roadmap" (Map icon) admin-only.

## Pending (intentionally deferred)
- DOB edit UI in admin/users member detail panel — backend endpoint exists and works, UI not yet added.
- Documents (Sprint 2B), Lodge Calendar (Sprint 2C).

**Why:** Spec said "do not implement Documents or Lodge Calendar yet." DOB editing in admin/users was not in the T004 session plan scope.

**How to apply:** When extending admin/users to edit DOB, use `PATCH /api/users/:id/date-of-birth` with body `{ dateOfBirth: "YYYY-MM-DD" | null }`.
