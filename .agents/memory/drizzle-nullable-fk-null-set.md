---
name: Drizzle ORM nullable FK null-set bug
description: Drizzle v0.45.2 silently no-ops .set({ col: null }) and .delete().where(eq(table.col, val)) for certain nullable FK columns; use raw sql`` instead.
---

## Rule
When a Drizzle ORM transaction step that must null out a nullable FK column (or delete a row matched by a nullable FK column) is critical for correctness, use `sql\`…\`` raw template literals instead of `.set({ col: null })` / `.delete().where(eq(table.col, val))`.

## Why
In Drizzle ORM 0.45.2 (`drizzle-orm@0.45.2`), certain `.set({ col: null })` and `.delete().where(eq(…))` calls on the `invitations` table (and possibly others with nullable FK columns) silently produced no-op SQL — 0 rows affected, no error thrown. This left FK references intact and caused the subsequent `DELETE FROM users` to fail with a PostgreSQL FK constraint violation.

The same SQL written as raw `sql\`UPDATE … SET col = NULL WHERE col = ${id}\`` worked correctly every time.

## How to apply
- In any delete-user-type transaction where invitation columns must be nulled: use `tx.execute(sql\`UPDATE invitations SET accepted_by_user = NULL WHERE accepted_by_user = ${id}\`)` instead of the ORM form.
- Same applies to `revoked_by`, `invited_by` deletes, and `user_document_notice_acceptance` deletes in that transaction.
- When debugging a "FK constraint still violated" error after a Drizzle transaction, check whether ORM `.set({ col: null })` is the silent culprit before looking at schema or data issues.
