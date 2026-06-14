import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";
import { lodgeYearsTable } from "./lodge-years";
import { tracingBoardCategoriesTable } from "./tracing-board-categories";

export const tracingBoardEntriesTable = pgTable("tracing_board_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  lodgeYearId: text("lodge_year_id").notNull().references(() => lodgeYearsTable.id),
  title: text("title").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  location: text("location"),
  description: text("description"),
  categoryId: text("category_id").references(() => tracingBoardCategoriesTable.id),
  visibility: text("visibility").notNull().default("members"),
  createdBy: text("created_by").references(() => usersTable.id),
  lastModifiedBy: text("last_modified_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_tb_entries_lodge").on(t.lodgeId),
  index("idx_tb_entries_year").on(t.lodgeYearId),
  index("idx_tb_entries_date").on(t.date),
  index("idx_tb_entries_visibility").on(t.visibility),
]);

export type TracingBoardEntry = typeof tracingBoardEntriesTable.$inferSelect;
export type InsertTracingBoardEntry = typeof tracingBoardEntriesTable.$inferInsert;
