import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { twoFactorSettingsTable, userRolesTable, rolesTable, configurationTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getLodgeId } from "../lib/config";

const REQUIRE_2FA_DEFAULT_SLUGS = ["site-administrator", "pm-super-administrator"];

export function require2FA() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (req.session.twoFactorVerified) {
      next();
      return;
    }

    const lodgeId = await getLodgeId();
    let required2FASlugs = REQUIRE_2FA_DEFAULT_SLUGS;

    if (lodgeId) {
      const cfgRows = await db
        .select({ value: configurationTable.value })
        .from(configurationTable)
        .where(and(eq(configurationTable.lodgeId, lodgeId), eq(configurationTable.key, "require_2fa_roles")))
        .limit(1);
      if (cfgRows[0]?.value) {
        required2FASlugs = cfgRows[0].value.split(",").map((s) => s.trim());
      }
    }

    const userRoleRows = await db
      .select({ slug: rolesTable.slug })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, userId));

    const userSlugs = userRoleRows.map((r) => r.slug);
    const needs2FA = userSlugs.some((slug) => required2FASlugs.includes(slug));

    if (!needs2FA) {
      next();
      return;
    }

    const tfRows = await db
      .select({ enabled: twoFactorSettingsTable.enabled })
      .from(twoFactorSettingsTable)
      .where(eq(twoFactorSettingsTable.userId, userId))
      .limit(1);

    const tfEnabled = tfRows[0]?.enabled ?? false;

    if (!tfEnabled) {
      res.status(403).json({ error: "Two-factor authentication setup required", code: "2FA_SETUP_REQUIRED" });
      return;
    }

    res.status(403).json({ error: "Two-factor authentication required", code: "2FA_REQUIRED" });
  };
}
