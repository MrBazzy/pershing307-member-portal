import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const lodgesTable = pgTable("lodges", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  number: text("number").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Lodge = typeof lodgesTable.$inferSelect;
export type InsertLodge = typeof lodgesTable.$inferInsert;
