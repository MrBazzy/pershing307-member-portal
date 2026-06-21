import { db } from "@workspace/db";
import { auditLogsTable, type AuditAction } from "@workspace/db/schema";
import { logger } from "./logger";

interface AuditEntry {
  lodgeId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  /** Full name of the actor — merged into detail.actorName at write time */
  actorName?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  /** Human-readable name for the target — merged into detail.targetName at write time */
  targetName?: string | null;
  /** Outcome of the action — merged into detail._result at write time */
  result?: "success" | "failed" | "denied" | "warning" | "info";
  /** Free-text reason — merged into detail._reason at write time */
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const enrichedDetail: Record<string, unknown> = { ...(entry.detail ?? {}) };
    if (entry.actorName) enrichedDetail.actorName = entry.actorName;
    if (entry.targetName) enrichedDetail.targetName = entry.targetName;
    if (entry.result)    enrichedDetail._result   = entry.result;
    if (entry.reason)    enrichedDetail._reason   = entry.reason;

    await db.insert(auditLogsTable).values({
      lodgeId: entry.lodgeId ?? null,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: Object.keys(enrichedDetail).length > 0 ? enrichedDetail : null,
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
