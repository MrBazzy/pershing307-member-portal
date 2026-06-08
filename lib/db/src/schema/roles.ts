import { pgTable, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";

export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  permissionLevel: integer("permission_level").notNull().default(10),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.lodgeId, t.slug)]);

export type Role = typeof rolesTable.$inferSelect;
export type InsertRole = typeof rolesTable.$inferInsert;
