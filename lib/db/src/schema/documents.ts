import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";
import { documentFoldersTable } from "./document-folders";

export type DocumentStatus = "pending_review" | "published" | "rejected" | "archived" | "deleted";

export const documentsTable = pgTable("documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  folderId: text("folder_id").notNull().references(() => documentFoldersTable.id, { onDelete: "restrict" }),
  uploaderId: text("uploader_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  originalFileName: text("original_file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  status: text("status").notNull().default("pending_review").$type<DocumentStatus>(),
  rejectionReason: text("rejection_reason"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_documents_lodge").on(t.lodgeId),
  index("idx_documents_folder").on(t.folderId),
  index("idx_documents_uploader").on(t.uploaderId),
  index("idx_documents_status").on(t.status),
]);

export type Document = typeof documentsTable.$inferSelect;
export type InsertDocument = typeof documentsTable.$inferInsert;
