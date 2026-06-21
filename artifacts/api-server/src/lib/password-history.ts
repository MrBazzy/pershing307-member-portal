import { db } from "@workspace/db";
import { passwordHistoryTable } from "@workspace/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { verifyPassword } from "./password";

const DEFAULT_HISTORY_LIMIT = 5;

export async function checkPasswordHistory(
  userId: string,
  newPassword: string,
  limit: number = DEFAULT_HISTORY_LIMIT
): Promise<boolean> {
  if (limit <= 0) return false;

  const history = await db
    .select({ passwordHash: passwordHistoryTable.passwordHash })
    .from(passwordHistoryTable)
    .where(eq(passwordHistoryTable.userId, userId))
    .orderBy(desc(passwordHistoryTable.createdAt))
    .limit(limit);

  for (const { passwordHash } of history) {
    if (await verifyPassword(passwordHash, newPassword)) {
      return true;
    }
  }
  return false;
}

export async function recordPasswordHistory(
  userId: string,
  passwordHash: string,
  limit: number = DEFAULT_HISTORY_LIMIT
): Promise<void> {
  await db.insert(passwordHistoryTable).values({ userId, passwordHash });

  const all = await db
    .select({ id: passwordHistoryTable.id })
    .from(passwordHistoryTable)
    .where(eq(passwordHistoryTable.userId, userId))
    .orderBy(desc(passwordHistoryTable.createdAt));

  const keepCount = limit > 0 ? limit : 0;
  const toDelete = all.slice(keepCount).map((h) => h.id);
  if (toDelete.length > 0) {
    await db.delete(passwordHistoryTable).where(inArray(passwordHistoryTable.id, toDelete));
  }
}
