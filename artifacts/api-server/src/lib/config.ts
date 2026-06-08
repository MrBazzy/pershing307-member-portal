import { db } from "@workspace/db";
import { configurationTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

let lodgeId: string | null = null;

export async function getLodgeId(): Promise<string | null> {
  if (lodgeId) return lodgeId;
  const { lodgesTable } = await import("@workspace/db/schema");
  const rows = await db.select().from(lodgesTable).limit(1);
  if (rows.length > 0) {
    lodgeId = rows[0].id;
  }
  return lodgeId;
}

export async function getConfig(key: string): Promise<string | null> {
  const lid = await getLodgeId();
  if (!lid) return null;
  const rows = await db
    .select()
    .from(configurationTable)
    .where(and(eq(configurationTable.lodgeId, lid), eq(configurationTable.key, key)))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function getConfigNumber(key: string, fallback: number): Promise<number> {
  const val = await getConfig(key);
  if (val === null) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

export async function setConfig(key: string, value: string, actorLodgeId?: string): Promise<void> {
  const lid = actorLodgeId ?? await getLodgeId();
  if (!lid) throw new Error("No lodge configured");
  await db
    .insert(configurationTable)
    .values({ lodgeId: lid, key, value })
    .onConflictDoUpdate({
      target: [configurationTable.lodgeId, configurationTable.key],
      set: { value, updatedAt: new Date() },
    });
}
