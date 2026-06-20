import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { lodgesTable } from "./lodges";

export const userDocumentNoticeAcceptanceTable = pgTable("user_document_notice_acceptance", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  noticeVersion: text("notice_version").notNull().default("document-notice-v1"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.userId, t.noticeVersion),
]);

export type UserDocumentNoticeAcceptance = typeof userDocumentNoticeAcceptanceTable.$inferSelect;
export type InsertUserDocumentNoticeAcceptance = typeof userDocumentNoticeAcceptanceTable.$inferInsert;
