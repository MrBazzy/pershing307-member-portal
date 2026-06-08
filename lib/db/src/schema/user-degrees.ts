import { pgTable, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { lodgesTable } from "./lodges";

export const userDegreesTable = pgTable("user_degrees", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id),
  degree: integer("degree").notNull(),
  conferredOn: date("conferred_on"),
  lodgeId: text("lodge_id").references(() => lodgesTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserDegree = typeof userDegreesTable.$inferSelect;
export type InsertUserDegree = typeof userDegreesTable.$inferInsert;
