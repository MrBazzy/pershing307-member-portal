import { pgTable, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const roadmapItemsTable = pgTable("roadmap_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planned"),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_roadmap_items_lodge").on(t.lodgeId),
  index("idx_roadmap_items_sort").on(t.sortOrder),
]);

export type RoadmapItem = typeof roadmapItemsTable.$inferSelect;
export type InsertRoadmapItem = typeof roadmapItemsTable.$inferInsert;
