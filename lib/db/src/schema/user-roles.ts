import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { rolesTable } from "./roles";

export const userRolesTable = pgTable("user_roles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id),
  roleId: text("role_id").notNull().references(() => rolesTable.id),
  grantedBy: text("granted_by").references(() => usersTable.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.roleId)]);

export type UserRole = typeof userRolesTable.$inferSelect;
export type InsertUserRole = typeof userRolesTable.$inferInsert;
