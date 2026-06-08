import { db } from "@workspace/db";
import { auditLogsTable, type AuditAction } from "@workspace/db/schema";
import { logger } from "./logger";

interface AuditEntry {
  lodgeId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      lodgeId: entry.lodgeId ?? null,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log");
  }
}

export function getClientIp(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
  }
  return req.ip ?? "unknown";
}
