import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
}, (t) => [index("idx_sessions_expire").on(t.expire)]);

export type Session = typeof sessionsTable.$inferSelect;
