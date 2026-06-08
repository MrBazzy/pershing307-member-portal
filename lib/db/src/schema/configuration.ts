import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";

export const configurationTable = pgTable("configuration", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  key: text("key").notNull(),
  value: text("value"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.lodgeId, t.key)]);

export type Configuration = typeof configurationTable.$inferSelect;
export type InsertConfiguration = typeof configurationTable.$inferInsert;
