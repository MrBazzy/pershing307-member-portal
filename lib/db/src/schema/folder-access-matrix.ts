import { pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { documentFoldersTable } from "./document-folders";

export type MatrixPermission = "view" | "upload" | "approve" | "manage";
export type MatrixSubjectType = "role" | "degree";

export const folderAccessMatrixTable = pgTable("folder_access_matrix", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  folderId: text("folder_id").notNull().references(() => documentFoldersTable.id, { onDelete: "cascade" }),
  subjectType: text("subject_type").notNull().$type<MatrixSubjectType>(),
  subjectKey: text("subject_key").notNull(),
  permission: text("permission").notNull().$type<MatrixPermission>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_fam_folder").on(t.folderId),
  index("idx_fam_lodge").on(t.lodgeId),
  unique("uq_fam_entry").on(t.folderId, t.subjectType, t.subjectKey, t.permission),
]);

export type FolderAccessMatrix = typeof folderAccessMatrixTable.$inferSelect;
export type InsertFolderAccessMatrix = typeof folderAccessMatrixTable.$inferInsert;
