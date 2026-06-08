import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const twoFactorSettingsTable = pgTable("two_factor_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => usersTable.id),
  totpSecret: text("totp_secret"),
  enabled: boolean("enabled").notNull().default(false),
  backupCodes: text("backup_codes").array(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TwoFactorSettings = typeof twoFactorSettingsTable.$inferSelect;
export type InsertTwoFactorSettings = typeof twoFactorSettingsTable.$inferInsert;
