---
name: Pershing307 Onboarding Report
description: Member Onboarding Progress tab in Reports — design decisions, data approach, and what happened to the Invitations menu.
---

## What was built
New "Onboarding" tab in `artifacts/portal/src/pages/admin/reports.tsx`.

## Key design decisions

**Invitations nav item removed** (`artifacts/portal/src/components/layout/app-layout.tsx` MANAGEMENT_ITEMS).
- The `/admin/invitations` route and all backend endpoints are still intact.
- The Cleanup function (bulk delete expired/revoked) was the ONLY capability unique to the Invitations page vs Members — it moved into the Onboarding report's toolbar.

**No new backend endpoint or codegen needed.**
- Data is a client-side join: `useListUsers({ limit: 1000 })` + `useListInvitations()`, joined on `email.toLowerCase()`.
- Per-member: pick the latest invitation (by `createdAt`) for their email.
- Status logic: `accepted` → `acceptedAt` set; `revoked` → `revokedAt` set; `expired` → `isPast(expiresAt)`; `pending` → neither; `not_invited` → no matching invitation.

**Why:** avoids a new API endpoint + orval codegen cycle; the data volume is small (hundreds of users); invitation count per email is always low.

**Actions from the report:**
- Not invited: "Send Invitation" — POST /api/users/:id/invitations then POST /api/invitations/:id/send (direct fetch, no generated hook).
- Pending: "Resend" — POST /api/invitations/:id/send; "Revoke" — `useRevokeInvitation().mutate({ id })`.
- Expired/Revoked: "Re-invite" — same flow as Send Invitation (creates new invitation).
- All rows: "Open Member Record" link → /admin/users (users page, user searches themselves).
- Cleanup: `useCleanupInvitations().mutate(void)` — takes `void`, returns `CleanupInvitationsResult` (cast needed for `.deleted` count).

**How to apply:**
- If adding more per-member report tabs in future, follow the same client-side join pattern first before creating new API endpoints.
- If the Invitations page ever needs to come back, just re-add `{ href: "/admin/invitations", label: "Invitations", icon: Mail }` to MANAGEMENT_ITEMS and restore the `Mail` lucide import.
