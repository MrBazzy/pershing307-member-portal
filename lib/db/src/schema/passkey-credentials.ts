import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { lodgesTable } from "./lodges";

export const passkeyCredentialsTable = pgTable("passkey_credentials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports").array().default([]),
  aaguid: text("aaguid"),
  label: text("label").notNull().default("Passkey"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type PasskeyCredential = typeof passkeyCredentialsTable.$inferSelect;
export type InsertPasskeyCredential = typeof passkeyCredentialsTable.$inferInsert;
