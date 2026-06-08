import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, twoFactorSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId, getConfig } from "../lib/config";
import { verifyPassword } from "../lib/password";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import crypto from "crypto";

const router = Router();

const verifyEnrollSchema = z.object({
  code: z.string().min(6).max(8),
});

const disableSchema = z.object({
  code: z.string().min(6).max(8),
});

function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

router.get("/status", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const rows = await db
    .select()
    .from(twoFactorSettingsTable)
    .where(eq(twoFactorSettingsTable.userId, userId))
    .limit(1);
  const tf = rows[0];

  res.json({
    enabled: tf?.enabled ?? false,
    enrolledAt: tf?.enrolledAt?.toISOString() ?? null,
    hasPendingEnrollment: !!(tf?.totpSecret && !tf.enabled),
  });
});

router.post("/enroll", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;

  const users = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = users[0];

  const existingRows = await db
    .select()
    .from(twoFactorSettingsTable)
    .where(eq(twoFactorSettingsTable.userId, userId))
    .limit(1);

  if (existingRows[0]?.enabled) {
    res.status(400).json({ error: "Two-factor authentication is already enabled" });
    return;
  }

  const lodgeName = (await getConfig("lodge_name")) ?? "Pershing307 Portal";

  const secret = speakeasy.generateSecret({
    name: `${lodgeName} (${user.email})`,
    length: 20,
  });

  const backupCodes = generateBackupCodes(8);
  const hashedBackupCodes = backupCodes.map((c) =>
    crypto.createHash("sha256").update(c.replace("-", "")).digest("hex")
  );

  if (existingRows.length > 0) {
    await db
      .update(twoFactorSettingsTable)
      .set({
        totpSecret: secret.base32,
        enabled: false,
        backupCodes: hashedBackupCodes,
        updatedAt: new Date(),
      })
      .where(eq(twoFactorSettingsTable.userId, userId));
  } else {
    await db.insert(twoFactorSettingsTable).values({
      userId,
      totpSecret: secret.base32,
      enabled: false,
      backupCodes: hashedBackupCodes,
    });
  }

  const qrCodeUri = await QRCode.toDataURL(secret.otpauth_url!);

  res.json({ qrCodeUri, backupCodes });
});

router.post("/verify-enroll", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;

  const result = verifyEnrollSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const rows = await db
    .select()
    .from(twoFactorSettingsTable)
    .where(eq(twoFactorSettingsTable.userId, userId))
    .limit(1);

  const tf = rows[0];
  if (!tf?.totpSecret || tf.enabled) {
    res.status(400).json({ error: "No pending 2FA enrollment" });
    return;
  }

  const verified = speakeasy.totp.verify({
    secret: tf.totpSecret,
    encoding: "base32",
    token: result.data.code,
    window: 1,
  });

  if (!verified) {
    res.status(400).json({ error: "Invalid authentication code" });
    return;
  }

  await db
    .update(twoFactorSettingsTable)
    .set({ enabled: true, enrolledAt: new Date(), updatedAt: new Date() })
    .where(eq(twoFactorSettingsTable.userId, userId));

  const lodgeId = await getLodgeId();
  const users = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: users[0]?.email,
    action: "2FA_ENROLLED",
    targetType: "user",
    targetId: userId,
    ipAddress: getClientIp(req),
  });

  req.session.twoFactorVerified = true;

  res.json({ success: true, message: "Two-factor authentication enabled successfully" });
});

router.delete("/", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;

  const result = disableSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request — TOTP code required to disable 2FA" });
    return;
  }

  const rows = await db
    .select()
    .from(twoFactorSettingsTable)
    .where(eq(twoFactorSettingsTable.userId, userId))
    .limit(1);

  const tf = rows[0];
  if (!tf?.totpSecret || !tf.enabled) {
    res.status(400).json({ error: "Two-factor authentication is not enabled" });
    return;
  }

  const verified = speakeasy.totp.verify({
    secret: tf.totpSecret,
    encoding: "base32",
    token: result.data.code,
    window: 1,
  });

  if (!verified) {
    res.status(401).json({ error: "Invalid authentication code" });
    return;
  }

  await db
    .update(twoFactorSettingsTable)
    .set({ enabled: false, totpSecret: null, backupCodes: null, enrolledAt: null, updatedAt: new Date() })
    .where(eq(twoFactorSettingsTable.userId, userId));

  req.session.twoFactorVerified = false;

  const lodgeId = await getLodgeId();
  const users = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    actorEmail: users[0]?.email,
    action: "2FA_DISABLED",
    targetType: "user",
    targetId: userId,
    ipAddress: getClientIp(req),
  });

  res.json({ success: true, message: "Two-factor authentication disabled" });
});

export default router;
