import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function invalidateUserSessions(userId: string, exceptSid?: string): Promise<number> {
  try {
    let result;
    if (exceptSid) {
      result = await pool.query(
        `DELETE FROM sessions WHERE (sess->>'userId') = $1 AND sid != $2`,
        [userId, exceptSid]
      );
    } else {
      result = await pool.query(
        `DELETE FROM sessions WHERE (sess->>'userId') = $1`,
        [userId]
      );
    }
    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ userId, count }, "Invalidated user sessions");
    }
    return count;
  } catch (err) {
    logger.error({ err, userId }, "Failed to invalidate user sessions");
    return 0;
  }
}
