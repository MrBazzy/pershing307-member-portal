import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable, userRolesTable, rolesTable, twoFactorSettingsTable, passwordResetTokensTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { hashPassword, verifyPassword, passwordSchema } from "../lib/password";
import { generateSecureToken } from "../lib/crypto";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { sendEmail, passwordResetEmailHtml } from "../lib/email";
import { getConfig, getConfigNumber, getLodgeId } from "../lib/config";
import { requireAuth } from "../middlewares/requireAuth";
import { invalidateUserSessions } from "../lib/sessions";
import { checkPasswordHistory, recordPasswordHistory } from "../lib/password-history";
import twoFactorRouter from "./two-factor";
import speakeasy from "speakeasy";

const router = Router();

function makeRateLimit(max: number, windowMs: number, errorMessage: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const ip = getClientIp(req);
      getLodgeId().then((lodgeId) => {
        writeAuditLog({
          lodgeId,
          action: "RATE_LIMIT_HIT",
          ipAddress: ip,
          detail: { path: req.path, limit: max, windowMs },
        }).catch(() => {});
      }).catch(() => {});
      res.status(429).json({ error: errorMessage });
    },
  });
}

const loginRateLimit = makeRateLimit(20, 15 * 60 * 1000, "Too many login attempts. Please try again in 15 minutes.");
const forgotPasswordRateLimit = makeRateLimit(5, 15 * 60 * 1000, "Too many password reset requests. Please try again in 15 minutes.");
const resetPasswordRateLimit = makeRateLimit(10, 15 * 60 * 1000, "Too many reset attempts. Please try again in 15 minutes.");
const twoFaRateLimit = makeRateLimit(10, 15 * 60 * 1000, "Too many authentication attempts. Please try again in 15 minutes.");

const TOTP_MAX_ATTEMPTS = 5;
const TOTP_LOCKOUT_MS = 15 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const twoFactorSchema = z.object({
  code: z.string().min(6).max(8),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  displayName: z.string().max(100).nullable().optional(),
});

async function getUserWithRoles(userId: string) {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) return null;

  const roles = await db
    .select({ name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  return { user, roles };
}

router.post("/login", loginRateLimit, async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }

  const { email, password } = result.data;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? null;
  const lodgeId = await getLodgeId();

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (users.length === 0) {
    await writeAuditLog({ lodgeId, actorEmail: email, action: "LOGIN_FAILED", ipAddress: ip, userAgent: ua, detail: { reason: "user_not_found" } });
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const user = users[0];

  if (!user.isActive) {
    await writeAuditLog({ lodgeId, actorId: user.id, actorEmail: user.email, action: "LOGIN_FAILED", ipAddress: ip, userAgent: ua, detail: { reason: "account_inactive" } });
    res.status(403).json({ error: "Your account is inactive. Please contact a lodge administrator." });
    return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await writeAuditLog({ lodgeId, actorId: user.id, actorEmail: user.email, action: "LOGIN_LOCKED", ipAddress: ip, userAgent: ua });
    res.status(423).json({ error: "Your account is temporarily locked." });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const valid = await verifyPassword(user.passwordHash, password);

  if (!valid) {
    const maxAttempts = await getConfigNumber("lockout_max_attempts", 5);
    const lockoutMinutes = await getConfigNumber("lockout_duration_min", 15);
    const newAttempts = user.failedLoginAttempts + 1;

    const updates: Partial<typeof usersTable.$inferInsert> = { failedLoginAttempts: newAttempts, updatedAt: new Date() };
    if (newAttempts >= maxAttempts) {
      updates.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id));
    await writeAuditLog({ lodgeId, actorId: user.id, actorEmail: user.email, action: "LOGIN_FAILED", ipAddress: ip, userAgent: ua, detail: { reason: "wrong_password", attempts: newAttempts } });

    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  await db.update(usersTable).set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  const tfRows = await db.select().from(twoFactorSettingsTable).where(eq(twoFactorSettingsTable.userId, user.id)).limit(1);
  const tfEnabled = tfRows[0]?.enabled ?? false;

  if (tfEnabled) {
    req.session.pendingTwoFactorUserId = user.id;
    req.session.failedTotpAttempts = 0;
    delete req.session.totpLockedUntil;
    res.json({ requiresTwoFactor: true });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  req.session.userId = user.id;
  req.session.lodgeId = user.lodgeId;
  req.session.twoFactorVerified = false;

  await writeAuditLog({ lodgeId: user.lodgeId, actorId: user.id, actorEmail: user.email, action: "LOGIN", ipAddress: ip, userAgent: ua });

  const roles = await db
    .select({ name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      roles,
    },
  });
});

router.post("/login/2fa", twoFaRateLimit, async (req, res) => {
  const pendingUserId = req.session?.pendingTwoFactorUserId;
  if (!pendingUserId) {
    res.status(400).json({ error: "No pending two-factor authentication" });
    return;
  }

  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? null;
  const lodgeId = await getLodgeId();

  const lockedUntilStr = req.session.totpLockedUntil;
  if (lockedUntilStr) {
    const lockedUntil = new Date(lockedUntilStr);
    if (lockedUntil > new Date()) {
      await writeAuditLog({ lodgeId, actorId: pendingUserId, action: "TOTP_LOCKED", ipAddress: ip, userAgent: ua });
      res.status(423).json({ error: "Too many failed attempts. Two-factor verification is temporarily locked. Please try again later." });
      return;
    }
    delete req.session.totpLockedUntil;
    req.session.failedTotpAttempts = 0;
  }

  const result = twoFactorSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const tfRows = await db.select().from(twoFactorSettingsTable).where(eq(twoFactorSettingsTable.userId, pendingUserId)).limit(1);
  const tf = tfRows[0];

  if (!tf?.totpSecret || !tf.enabled) {
    res.status(400).json({ error: "Two-factor authentication not configured" });
    return;
  }

  const verified = speakeasy.totp.verify({
    secret: tf.totpSecret,
    encoding: "base32",
    token: result.data.code,
    window: 1,
  });

  if (!verified) {
    const attempts = (req.session.failedTotpAttempts ?? 0) + 1;
    req.session.failedTotpAttempts = attempts;

    if (attempts >= TOTP_MAX_ATTEMPTS) {
      req.session.totpLockedUntil = new Date(Date.now() + TOTP_LOCKOUT_MS).toISOString();
      await writeAuditLog({ lodgeId, actorId: pendingUserId, action: "TOTP_LOCKED", ipAddress: ip, userAgent: ua, detail: { attempts } });
      res.status(423).json({ error: "Too many failed attempts. Two-factor verification is locked for 15 minutes." });
    } else {
      await writeAuditLog({ lodgeId, actorId: pendingUserId, action: "TOTP_FAILED", ipAddress: ip, userAgent: ua, detail: { attempts, remaining: TOTP_MAX_ATTEMPTS - attempts } });
      res.status(401).json({ error: "Invalid authentication code", attemptsRemaining: TOTP_MAX_ATTEMPTS - attempts });
    }
    return;
  }

  req.session.failedTotpAttempts = 0;
  delete req.session.totpLockedUntil;

  const users = await db.select().from(usersTable).where(eq(usersTable.id, pendingUserId)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
  await db.update(twoFactorSettingsTable).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(twoFactorSettingsTable.userId, user.id));

  delete req.session.pendingTwoFactorUserId;
  req.session.userId = user.id;
  req.session.lodgeId = user.lodgeId;
  req.session.twoFactorVerified = true;

  await writeAuditLog({ lodgeId: user.lodgeId, actorId: user.id, actorEmail: user.email, action: "LOGIN_2FA", ipAddress: ip, userAgent: ua });

  const roles = await db
    .select({ name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      roles,
    },
  });
});

router.post("/logout", requireAuth(), async (req, res) => {
  const userId = req.session?.userId;
  const lodgeId = req.session?.lodgeId;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? null;

  const users = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId!)).limit(1);
  const email = users[0]?.email;

  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.clearCookie("portal.sid");
    writeAuditLog({ lodgeId, actorId: userId, actorEmail: email, action: "LOGOUT", ipAddress: ip, userAgent: ua });
    res.json({ success: true });
  });
});

router.get("/me", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const roles = await db
    .select({ name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      membershipStatus: user.membershipStatus,
      mustChangePassword: user.mustChangePassword,
      roles,
    },
  });
});

router.post("/change-password", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const currentSid = req.session.id;

  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }

  const { currentPassword, newPassword } = result.data;

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.passwordHash) {
    res.status(400).json({ error: "No password set on this account" });
    return;
  }

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const usedBefore = await checkPasswordHistory(userId, newPassword);
  if (usedBefore) {
    const lodgeId = await getLodgeId();
    await writeAuditLog({ lodgeId, actorId: userId, actorEmail: user.email, action: "PASSWORD_HISTORY_VIOLATION", targetType: "user", targetId: userId, ipAddress: getClientIp(req) });
    res.status(400).json({ error: "This password has been used recently. Please choose a different password." });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, passwordChangedAt: new Date(), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  await recordPasswordHistory(userId, newHash);

  const lodgeId = await getLodgeId();
  await writeAuditLog({ lodgeId, actorId: userId, actorEmail: user.email, action: "PASSWORD_CHANGED", targetType: "user", targetId: userId, ipAddress: getClientIp(req) });

  await invalidateUserSessions(userId, currentSid);

  res.json({ success: true, message: "Password changed successfully" });
});

router.patch("/profile", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;

  const result = profileUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (result.data.firstName !== undefined) updates.firstName = result.data.firstName;
  if (result.data.lastName !== undefined) updates.lastName = result.data.lastName;
  if (result.data.displayName !== undefined) updates.displayName = result.data.displayName;

  if (result.data.firstName !== undefined || result.data.lastName !== undefined) {
    updates.mustChangePassword = false;
  }

  await db.update(usersTable).set(updates as any).where(eq(usersTable.id, userId));

  res.json({ success: true });
});

router.post("/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { email } = result.data;
  const lodgeId = await getLodgeId();
  const ip = getClientIp(req);

  const users = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email.toLowerCase()), eq(usersTable.isActive, true)))
    .limit(1);

  res.json({ success: true, message: "If an account exists for this email, a reset link has been sent." });

  if (users.length === 0) return;
  const user = users[0];

  const expiryHours = await getConfigNumber("reset_expiry_hours", 1);
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({ userId: user.id, token, expiresAt });

  const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const lodgeName = (await getConfig("lodge_name")) ?? "Member Portal";

  await sendEmail({
    to: user.email,
    subject: `${lodgeName} — Password Reset`,
    html: passwordResetEmailHtml({ firstName: user.firstName, lodgeName, resetUrl }),
  });

  await writeAuditLog({ lodgeId, actorId: user.id, actorEmail: user.email, action: "PASSWORD_RESET_REQUESTED", ipAddress: ip });
});

router.post("/reset-password", resetPasswordRateLimit, async (req, res) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }

  const { token, password } = result.data;

  const tokens = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        gt(passwordResetTokensTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (tokens.length === 0 || tokens[0].usedAt) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  const resetToken = tokens[0];

  const usersRow = await db.select().from(usersTable).where(eq(usersTable.id, resetToken.userId)).limit(1);
  const user = usersRow[0];

  const usedBefore = await checkPasswordHistory(resetToken.userId, password);
  if (usedBefore) {
    const lodgeId = await getLodgeId();
    await writeAuditLog({ lodgeId, actorId: resetToken.userId, actorEmail: user?.email, action: "PASSWORD_HISTORY_VIOLATION", targetType: "user", targetId: resetToken.userId, ipAddress: getClientIp(req) });
    res.status(400).json({ error: "This password has been used recently. Please choose a different password." });
    return;
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(usersTable)
    .set({ passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(usersTable.id, resetToken.userId));
  await db.update(passwordResetTokensTable).set({ usedAt: new Date() }).where(eq(passwordResetTokensTable.id, resetToken.id));

  await recordPasswordHistory(resetToken.userId, passwordHash);

  await writeAuditLog({
    lodgeId: user?.lodgeId,
    actorId: resetToken.userId,
    actorEmail: user?.email,
    action: "PASSWORD_RESET_COMPLETED",
    ipAddress: getClientIp(req),
  });

  await invalidateUserSessions(resetToken.userId);

  res.json({ success: true });
});

router.use("/2fa", twoFactorRouter);

export default router;
