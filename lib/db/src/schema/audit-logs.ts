import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { lodgesTable } from "./lodges";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  lodgeId: text("lodge_id").references(() => lodgesTable.id),
  actorId: text("actor_id").references(() => usersTable.id),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  detail: jsonb("detail"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_audit_logs_actor").on(t.actorId),
  index("idx_audit_logs_action").on(t.action),
  index("idx_audit_logs_created").on(t.createdAt),
  index("idx_audit_logs_actor_email").on(t.actorEmail),
  index("idx_audit_logs_target_type").on(t.targetType),
]);

export type AuditLog = typeof auditLogsTable.$inferSelect;

export type AuditAction =
  | "LOGIN"
  | "LOGIN_2FA"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED"
  | "LOGOUT"
  | "TOTP_FAILED"
  | "TOTP_LOCKED"
  | "RATE_LIMIT_HIT"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_HISTORY_VIOLATION"
  | "INVITATION_CREATED"
  | "INVITATION_ACCEPTED"
  | "INVITATION_REVOKED"
  | "INVITATIONS_CLEANED_UP"
  | "MEMBERSHIP_STATUS_CHANGED"
  | "ROLE_GRANTED"
  | "ROLE_REVOKED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "DOMAIN_ACCESS_GRANTED"
  | "DOMAIN_ACCESS_REVOKED"
  | "DEGREE_RECORDED"
  | "DEGREE_REMOVED"
  | "2FA_ENROLLED"
  | "2FA_DISABLED"
  | "BOOTSTRAP_COMPLETED"
  | "CONFIG_CHANGED"
  | "SMTP_TEST"
  | "TEST_USER_RESET"
  | "PASSWORD_RESET_BY_ADMIN"
  | "PASSWORD_CHANGED_AFTER_RESET"
  | "DOB_UPDATED"
  | "BIRTHDAY_VISIBILITY_CHANGED"
  | "ROADMAP_ITEM_CREATED"
  | "ROADMAP_ITEM_UPDATED"
  | "ROADMAP_ITEM_DELETED"
  | "LODGE_YEAR_CREATED"
  | "LODGE_YEAR_ACTIVATED"
  | "LODGE_YEAR_ARCHIVED"
  | "LODGE_YEAR_RESTORED"
  | "LODGE_YEAR_UPDATED"
  | "LODGE_YEAR_DELETED"
  | "TB_ENTRY_CREATED"
  | "TB_ENTRY_UPDATED"
  | "TB_ENTRY_DELETED"
  | "TB_CATEGORY_CREATED"
  | "TB_CATEGORY_UPDATED"
  | "TB_CATEGORY_DISABLED"
  | "TB_CATEGORY_REORDERED"
  | "TB_CATEGORY_DELETED"
  | "EVENT_CREATED"
  | "EVENT_UPDATED"
  | "EVENT_DELETED"
  | "EVENT_CATEGORY_CREATED"
  | "EVENT_CATEGORY_UPDATED"
  | "EVENT_CATEGORY_DISABLED"
  | "EVENT_CATEGORY_REORDERED"
  | "EVENT_CATEGORY_DELETED"
  | "USER_NAME_UPDATED"
  | "PASSKEY_REGISTERED"
  | "PASSKEY_REMOVED"
  | "PASSKEY_LOGIN_SUCCESS"
  | "PASSKEY_LOGIN_FAILED"
  | "PASSKEY_REVOKED_BY_ADMIN"
  | "HISTORY_SECTION_CREATED"
  | "HISTORY_SECTIONS_REORDERED"
  | "HISTORY_SECTION_UPDATED"
  | "HISTORY_SECTION_DELETED"
  | "HISTORY_TIMELINE_CREATED"
  | "HISTORY_TIMELINE_UPDATED"
  | "HISTORY_TIMELINE_DELETED"
  | "HISTORY_DOCUMENT_CREATED"
  | "HISTORY_DOCUMENT_UPDATED"
  | "HISTORY_DOCUMENT_DELETED"
  | "HISTORY_PAGE_UPDATED"
  | "PERSHING_BIO_UPDATED"
  | "FOLDER_CREATED"
  | "FOLDER_RENAMED"
  | "FOLDER_DELETED"
  | "SUBFOLDER_CREATED"
  | "SUBFOLDER_RENAMED"
  | "SUBFOLDER_DELETED"
  | "DOMAIN_CREATED"
  | "DOMAIN_UPDATED"
  | "DOMAIN_ACCESS_RULE_CHANGED"
  | "FOLDER_DOMAIN_LINKED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_APPROVED"
  | "DOCUMENT_REJECTED"
  | "DOCUMENT_ARCHIVED"
  | "DOCUMENT_DELETED"
  | "DOCUMENT_RESTORED"
  | "DOCUMENT_WITHDRAWN"
  | "DOCUMENT_RENAMED"
  | "DOCUMENT_MOVED"
  | "DOCUMENT_DOWNLOADED";
