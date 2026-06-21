---
name: Pershing307 Member Management Redesign
description: Notes on the MEMBERS-MANAGEMENT-001 feature — create/delete member, invitation flow for pre-created users, 7-tab UserDetailSheet
---

## Create Member Flow
- `POST /api/users` — creates user with no password, isActive: false, membershipStatus: "pending"
- Admin then creates invitation via `POST /api/users/:id/invitations`
- Admin sends invitation email via `POST /api/invitations/:id/send`
- Accept invitation (`POST /api/invitations/accept`) detects pre-created users by checking `passwordHash IS NULL` and updates instead of inserting

## Delete Member
- `DELETE /api/users/:id` — requires SITE_ADMIN_LEVEL (80)
- Guards: no self-delete, no bootstrap admin, PM Super Admin only deletable by PM Super Admin, last-PM-Super protected
- Transaction: nulls out FK references in audit_logs/invitations/user_roles, then deletes all related records, then deletes user
- Logs DELETE_BLOCKED or MEMBER_DELETED after

## Invitation Model for Pre-Created Members
- `POST /api/users/:id/invitations` creates invitation WITHOUT sending email
- `POST /api/invitations/:id/send` sends the email and logs INVITATION_SENT
- Frontend Invitations tab shows status + Create/Send/Copy Link/Revoke actions
- Invitation status derived from GET /api/users/:id/invitations (ordered newest-first)

## GET /api/users/:id Extensions
- Now returns `lockedUntil` and `isBootstrapAdmin` fields (accessed via `(user as any)` in frontend due to stale generated types)

## Frontend Tab Architecture (UserDetailSheet)
7 tabs: Overview | Profile | Roles & Degrees | Invitations | Security | Timeline | Delete
- Sheet width: `w-full sm:max-w-3xl`
- TabsList: `flex overflow-x-auto` with `shrink-0` triggers for horizontal scroll on mobile

**Why:** The old single-section drawer was too cramped for the amount of data. Tabs allow focused editing per concern without scrolling through unrelated UI.
