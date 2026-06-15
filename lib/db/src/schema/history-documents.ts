import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const historyDocumentsTable = pgTable("history_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  documentDate: text("document_date"),
  category: text("category"),
  fileUrl: text("file_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_history_docs_lodge").on(t.lodgeId),
]);

export type HistoryDocument = typeof historyDocumentsTable.$inferSelect;
export type InsertHistoryDocument = typeof historyDocumentsTable.$inferInsert;
