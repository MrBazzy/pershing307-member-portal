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
]);

export type AuditLog = typeof auditLogsTable.$inferSelect;

export type AuditAction =
  | "LOGIN"
  | "LOGIN_2FA"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED"
  | "LOGOUT"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "PASSWORD_CHANGED"
  | "INVITATION_CREATED"
  | "INVITATION_ACCEPTED"
  | "INVITATION_REVOKED"
  | "ROLE_GRANTED"
  | "ROLE_REVOKED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "BOOTSTRAP_COMPLETED"
  | "CONFIG_CHANGED";
