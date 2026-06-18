import { pgTable, text, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export type DomainAccessLogic = "role_only" | "degree_only" | "role_or_degree" | "role_and_degree";

export const protectedDomainsTable = pgTable("protected_domains", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  accessLogic: text("access_logic").notNull().$type<DomainAccessLogic>().default("role_only"),
  allowedRoleSlugs: jsonb("allowed_role_slugs").$type<string[]>().default([]),
  minDegree: integer("min_degree"),
  createdBy: text("created_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.lodgeId, t.slug)]);

export type ProtectedDomain = typeof protectedDomainsTable.$inferSelect;
export type InsertProtectedDomain = typeof protectedDomainsTable.$inferInsert;
