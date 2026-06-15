import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const historyTimelineTable = pgTable("history_timeline_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  year: integer("year").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_history_timeline_lodge").on(t.lodgeId),
  index("idx_history_timeline_year").on(t.year),
]);

export type HistoryTimeline = typeof historyTimelineTable.$inferSelect;
export type InsertHistoryTimeline = typeof historyTimelineTable.$inferInsert;
