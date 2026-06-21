import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { getLodgeId, getConfigNumber } from "./config";
import { writeAuditLog } from "./audit";
import { logger } from "./logger";

export async function runInactiveSweep(): Promise<void> {
  try {
    const lodgeId = await getLodgeId();
    if (!lodgeId) return;

    const months = await getConfigNumber("inactive_after_months", 0);
    if (months <= 0) return;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const affected = await db
      .update(usersTable)
      .set({ membershipStatus: "inactive", updatedAt: new Date() })
      .where(
        and(
          eq(usersTable.lodgeId, lodgeId),
          eq(usersTable.membershipStatus, "active"),
          isNotNull(usersTable.lastLoginAt),
          lt(usersTable.lastLoginAt, cutoff),
        ),
      )
      .returning({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName });

    if (affected.length > 0) {
      logger.info({ count: affected.length, cutoff, months }, "Auto-inactive sweep: marked members inactive");

      await Promise.all(
        affected.map((u) => {
          const memberName = `${u.firstName} ${u.lastName}`.trim();
          return writeAuditLog({
            lodgeId,
            actorId: null,
            action: "MEMBERSHIP_STATUS_CHANGED",
            targetType: "user",
            targetId: u.id,
            detail: {
              from: "active",
              to: "inactive",
              source: "auto_sweep",
              inactiveAfterMonths: months,
              summary: `${memberName} automatically marked inactive after ${months} month${months === 1 ? "" : "s"} without login`,
            },
            ipAddress: null,
          });
        }),
      );
    }
  } catch (err) {
    logger.warn({ err }, "Auto-inactive sweep failed — will retry next cycle");
  }
}
