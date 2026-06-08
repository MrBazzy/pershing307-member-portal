import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { protectedDomainsTable } from "./protected-domains";

export const userDomainAccessTable = pgTable("user_domain_access", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id),
  domainId: text("domain_id").notNull().references(() => protectedDomainsTable.id),
  grantedBy: text("granted_by").references(() => usersTable.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.userId, t.domainId)]);

export type UserDomainAccess = typeof userDomainAccessTable.$inferSelect;
export type InsertUserDomainAccess = typeof userDomainAccessTable.$inferInsert;
