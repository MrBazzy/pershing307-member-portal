import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";

export const protectedDomainsTable = pgTable("protected_domains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.lodgeId, t.slug)]);

export type ProtectedDomain = typeof protectedDomainsTable.$inferSelect;
export type InsertProtectedDomain = typeof protectedDomainsTable.$inferInsert;
