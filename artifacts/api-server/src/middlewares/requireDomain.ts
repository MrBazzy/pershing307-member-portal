import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { userDomainAccessTable, protectedDomainsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export function requireDomain(domainSlug: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const rows = await db
      .select({ id: userDomainAccessTable.id })
      .from(userDomainAccessTable)
      .innerJoin(protectedDomainsTable, eq(userDomainAccessTable.domainId, protectedDomainsTable.id))
      .where(
        and(
          eq(userDomainAccessTable.userId, userId),
          eq(protectedDomainsTable.slug, domainSlug)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      res.status(403).json({ error: "Access to this domain is restricted" });
      return;
    }

    next();
  };
}
