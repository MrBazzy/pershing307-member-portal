import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { userRolesTable, rolesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export function requireRole(minLevel: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const rows = await db
      .select({ permissionLevel: rolesTable.permissionLevel })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, userId));

    const maxLevel = rows.reduce((max, r) => Math.max(max, r.permissionLevel), 0);

    if (maxLevel < minLevel) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    req.userPermissionLevel = maxLevel;
    next();
  };
}
