import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { userDegreesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId, getConfig, setConfig } from "../lib/config";

const router = Router();

const ADMINISTRATOR_LEVEL = 70;
const SITE_ADMIN_LEVEL = 80;

const DEFAULT_DEGREE_DEFINITIONS = [
  { degree: 1, name: "Entered Apprentice", abbreviation: "EA" },
  { degree: 2, name: "Fellow Craft", abbreviation: "FC" },
  { degree: 3, name: "Master Mason", abbreviation: "MM" },
  { degree: 4, name: "Past Master", abbreviation: "PM" },
];

async function getDegreeDefinitions() {
  const raw = await getConfig("degree_definitions");
  if (!raw) return DEFAULT_DEGREE_DEFINITIONS;
  try {
    return JSON.parse(raw) as typeof DEFAULT_DEGREE_DEFINITIONS;
  } catch {
    return DEFAULT_DEGREE_DEFINITIONS;
  }
}

router.get("/definitions", requireAuth(), async (_req, res) => {
  const definitions = await getDegreeDefinitions();
  res.json({ definitions });
});

const degreeDefSchema = z.object({
  definitions: z.array(
    z.object({
      degree: z.number().int().min(1),
      name: z.string().min(1).max(100),
      abbreviation: z.string().min(1).max(10),
    })
  ).min(1),
});

router.put("/definitions", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const result = degreeDefSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  await setConfig("degree_definitions", JSON.stringify(result.data.definitions));

  res.json({ success: true });
});

router.get("/:userId", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.userId);
  const definitions = await getDegreeDefinitions();

  const degreeRows = await db
    .select()
    .from(userDegreesTable)
    .where(eq(userDegreesTable.userId, targetUserId))
    .orderBy(userDegreesTable.degree);

  const degrees = degreeRows.map((d) => {
    const def = definitions.find((def) => def.degree === d.degree);
    return {
      id: d.id,
      degree: d.degree,
      degreeName: def?.name ?? `Degree ${d.degree}`,
      conferredOn: d.conferredOn ?? null,
      notes: d.notes ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  });

  res.json({ degrees });
});

const addDegreeSchema = z.object({
  degree: z.number().int().min(1),
  conferredOn: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

router.post("/:userId", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.userId);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const result = addDegreeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { degree, conferredOn, notes } = result.data;

  const definitions = await getDegreeDefinitions();
  const def = definitions.find((d) => d.degree === degree);

  await db.insert(userDegreesTable).values({
    userId: targetUserId,
    degree,
    lodgeId: lodgeId ?? undefined,
    conferredOn: conferredOn ?? null,
    notes: notes ?? null,
  });

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DEGREE_RECORDED",
    targetType: "user",
    targetId: targetUserId,
    detail: { degree, degreeName: def?.name ?? `Degree ${degree}`, conferredOn },
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ success: true });
});

router.delete("/:userId/:degreeId", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
  const targetUserId = String(req.params.userId);
  const degreeId = String(req.params.degreeId);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const existing = await db
    .select()
    .from(userDegreesTable)
    .where(and(eq(userDegreesTable.id, degreeId), eq(userDegreesTable.userId, targetUserId)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Degree record not found" });
    return;
  }

  await db.delete(userDegreesTable).where(eq(userDegreesTable.id, degreeId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "DEGREE_REMOVED",
    targetType: "user",
    targetId: targetUserId,
    detail: { degreeId, degree: existing[0].degree },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
