import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const historyPageTable = pgTable("history_page", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  title: text("title").notNull().default("Our History"),
  content: text("content").notNull().default(""),
  updatedBy: text("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_history_page_lodge").on(t.lodgeId),
]);

export type HistoryPage = typeof historyPageTable.$inferSelect;
export type InsertHistoryPage = typeof historyPageTable.$inferInsert;
