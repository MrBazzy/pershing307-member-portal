import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const eventCategoriesTable = pgTable("event_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").references(() => usersTable.id),
  lastModifiedBy: text("last_modified_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_event_categories_lodge").on(t.lodgeId),
]);

export type EventCategory = typeof eventCategoriesTable.$inferSelect;
export type InsertEventCategory = typeof eventCategoriesTable.$inferInsert;
