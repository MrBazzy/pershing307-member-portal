import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";
import { rolesTable } from "./roles";

export const invitationsTable = pgTable("invitations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").notNull().references(() => usersTable.id),
  roleId: text("role_id").references(() => rolesTable.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedByUser: text("accepted_by_user").references(() => usersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Invitation = typeof invitationsTable.$inferSelect;
export type InsertInvitation = typeof invitationsTable.$inferInsert;
