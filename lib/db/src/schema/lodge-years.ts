import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const lodgeYearsTable = pgTable("lodge_years", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  title: text("title").notNull(),
  startYear: integer("start_year").notNull(),
  endYear: integer("end_year").notNull(),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_lodge_years_lodge").on(t.lodgeId),
  index("idx_lodge_years_status").on(t.status),
]);

export type LodgeYear = typeof lodgeYearsTable.$inferSelect;
export type InsertLodgeYear = typeof lodgeYearsTable.$inferInsert;
