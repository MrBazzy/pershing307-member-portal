import { pgTable, text, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";
import { protectedDomainsTable } from "./protected-domains";

export type FolderAccessPolicy =
  | { type: "member" }
  | { type: "roles"; slugs: string[] }
  | { type: "degree"; minDegree: number };

export const documentFoldersTable = pgTable("document_folders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").notNull().references(() => lodgesTable.id),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  description: text("description"),
  accessPolicy: jsonb("access_policy").$type<FolderAccessPolicy>(),
  domainId: text("domain_id").references(() => protectedDomainsTable.id, { onDelete: "set null" }),
  frame: text("frame").notNull().default("general"),
  isSystemRoot: boolean("is_system_root").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_doc_folders_lodge").on(t.lodgeId),
  index("idx_doc_folders_parent").on(t.parentId),
]);

export type DocumentFolder = typeof documentFoldersTable.$inferSelect;
export type InsertDocumentFolder = typeof documentFoldersTable.$inferInsert;
