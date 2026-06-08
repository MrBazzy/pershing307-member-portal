import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    lodgeId?: string;
    twoFactorVerified?: boolean;
    pendingTwoFactorUserId?: string;
    failedTotpAttempts?: number;
    totpLockedUntil?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      userPermissionLevel?: number;
    }
  }
}
