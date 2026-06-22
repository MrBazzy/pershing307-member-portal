import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId, getConfig, setConfig } from "../lib/config";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const ADMIN_LEVEL = 80;
const CONFIG_KEY = "nav_config";

export const NAV_ITEM_SLUGS = [
  "dashboard",
  "tracing-board",
  "history",
  "events",
  "birthdays",
  "documents",
] as const;

export type NavItemSlug = (typeof NAV_ITEM_SLUGS)[number];

const DEFAULT_ITEMS: NavConfigItem[] = NAV_ITEM_SLUGS.map((slug) => ({
  slug,
  enabled: true,
  minLevel: 10,
}));

interface NavConfigItem {
  slug: string;
  enabled: boolean;
  minLevel: number;
}

const navConfigItemSchema = z.object({
  slug: z.enum(NAV_ITEM_SLUGS),
  enabled: z.boolean(),
  minLevel: z.number().int().min(0),
});

const navConfigBodySchema = z.object({
  items: z.array(navConfigItemSchema),
});

function mergeWithDefaults(stored: NavConfigItem[]): NavConfigItem[] {
  return NAV_ITEM_SLUGS.map((slug) => {
    const found = stored.find((i) => i.slug === slug);
    return found ?? { slug, enabled: true, minLevel: 10 };
  });
}

async function readNavConfig(): Promise<NavConfigItem[]> {
  const raw = await getConfig(CONFIG_KEY);
  if (!raw) return DEFAULT_ITEMS;
  try {
    const parsed = JSON.parse(raw) as NavConfigItem[];
    return mergeWithDefaults(Array.isArray(parsed) ? parsed : []);
  } catch {
    return DEFAULT_ITEMS;
  }
}

router.get("/", requireAuth(), async (_req, res) => {
  const items = await readNavConfig();
  res.json({ items });
});

router.put("/", requireAuth(), requireRole(ADMIN_LEVEL), async (req, res) => {
  const parsed = navConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
  }

  const lodgeId = await getLodgeId();
  if (!lodgeId) return res.status(500).json({ error: "Lodge not configured" });

  const actorId = req.session!.userId!;
  const actor = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, actorId))
    .then((r) => r[0] ?? null);

  const items = mergeWithDefaults(parsed.data.items);
  await setConfig(CONFIG_KEY, JSON.stringify(items), lodgeId);

  await writeAuditLog({
    lodgeId,
    actorId,
    actorEmail: actor?.email ?? "unknown",
    action: "NAV_CONFIG_UPDATED",
    targetType: "nav_config",
    targetId: "nav_config",
    detail: { items },
    ipAddress: getClientIp(req),
  });

  res.json({ items });
});

export default router;
