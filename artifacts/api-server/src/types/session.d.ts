import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    lodgeId?: string;
    twoFactorVerified?: boolean;
    pendingTwoFactorUserId?: string;
    pendingTwoFactorExpiry?: number;
    failedTotpAttempts?: number;
    totpLockedUntil?: string;
    forceLogout?: boolean;
    webauthnChallenge?: string;
    webauthnRpId?: string;
    webauthnOrigin?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      userPermissionLevel?: number;
    }
  }
}
