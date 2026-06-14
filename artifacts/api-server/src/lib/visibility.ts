import { db } from "@workspace/db";
import { userDegreesTable, userRolesTable, rolesTable } from "@workspace/db/schema";
import { eq, max } from "drizzle-orm";

export const VISIBILITY_VALUES = [
  "members",
  "ea_plus",
  "fc_plus",
  "mm_only",
  "officers",
  "past_masters",
] as const;

export type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

export const VISIBILITY_LABELS: Record<VisibilityValue, string> = {
  members: "All Members",
  ea_plus: "EA+ (Entered Apprentice and above)",
  fc_plus: "FC+ (Fellowcraft and above)",
  mm_only: "MM Only (Master Mason)",
  officers: "Officers",
  past_masters: "Past Masters",
};

interface UserContext {
  maxDegree: number;
  maxPermLevel: number;
  roleSlugs: string[];
}

export async function getUserVisibilityContext(userId: string): Promise<UserContext> {
  const [degreeRows, roleRows] = await Promise.all([
    db
      .select({ degree: userDegreesTable.degree })
      .from(userDegreesTable)
      .where(eq(userDegreesTable.userId, userId)),
    db
      .select({ permissionLevel: rolesTable.permissionLevel, slug: rolesTable.slug })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, userId)),
  ]);

  const maxDegree = degreeRows.reduce((max, r) => Math.max(max, r.degree), 0);
  const maxPermLevel = roleRows.reduce((max, r) => Math.max(max, r.permissionLevel), 0);
  const roleSlugs = roleRows.map((r) => r.slug);

  return { maxDegree, maxPermLevel, roleSlugs };
}

export function getAllowedVisibilities(ctx: UserContext): VisibilityValue[] {
  const { maxDegree, maxPermLevel, roleSlugs } = ctx;

  if (maxPermLevel >= 80) {
    return [...VISIBILITY_VALUES];
  }

  const allowed: VisibilityValue[] = ["members"];
  if (maxDegree >= 1) allowed.push("ea_plus");
  if (maxDegree >= 2) allowed.push("fc_plus");
  if (maxDegree >= 3) allowed.push("mm_only");
  if (maxPermLevel >= 30) allowed.push("officers");
  if (roleSlugs.includes("past-master")) allowed.push("past_masters");

  return allowed;
}
