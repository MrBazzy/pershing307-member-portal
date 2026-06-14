import type { Request, Response, NextFunction } from "express";

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.session.forceLogout) {
      req.session.destroy(() => {});
      res.status(401).json({
        error: "Your access rights have changed. Please log in again.",
        reason: "force_logout",
      });
      return;
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  };
}
