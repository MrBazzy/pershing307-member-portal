import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const historySectionsTable = pgTable("history_sections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  yearPeriod: text("year_period").notNull(),
  chapterTitle: text("chapter_title").notNull(),
  bodyText: text("body_text").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_history_sections_lodge").on(t.lodgeId),
  index("idx_history_sections_sort").on(t.lodgeId, t.sortOrder),
]);

export type HistorySection = typeof historySectionsTable.$inferSelect;
export type InsertHistorySection = typeof historySectionsTable.$inferInsert;
