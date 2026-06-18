import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable, rolesTable, userRolesTable, passkeyCredentialsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { getLodgeId } from "../lib/config";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

const SITE_ADMIN_LEVEL = 80;

const router = Router();

function getWebAuthnConfig(req: { headers: { origin?: string } }) {
  const origin = process.env.WEBAUTHN_RP_ORIGIN || req.headers.origin || "http://localhost";
  let rpId: string;
  try {
    rpId = process.env.WEBAUTHN_RP_ID || new URL(origin).hostname;
  } catch {
    rpId = "localhost";
  }
  const rpName = process.env.WEBAUTHN_RP_NAME || "Pershing No. 307";
  return { origin, rpId, rpName };
}

const passkeyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many passkey attempts. Please try again later." });
  },
});

router.get("/", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const passkeys = await db
    .select({
      id: passkeyCredentialsTable.id,
      label: passkeyCredentialsTable.label,
      aaguid: passkeyCredentialsTable.aaguid,
      transports: passkeyCredentialsTable.transports,
      createdAt: passkeyCredentialsTable.createdAt,
      lastUsedAt: passkeyCredentialsTable.lastUsedAt,
    })
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.userId, userId))
    .orderBy(desc(passkeyCredentialsTable.createdAt));

  res.json({ passkeys });
});

router.post("/registration/begin", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const { rpId, rpName, origin } = getWebAuthnConfig(req);

  const users = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const user = users[0];

  const existing = await db
    .select({ credentialId: passkeyCredentialsTable.credentialId, transports: passkeyCredentialsTable.transports })
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.userId, userId));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userID: new TextEncoder().encode(userId),
    userName: user.email,
    userDisplayName: `${user.firstName} ${user.lastName}`.trim(),
    excludeCredentials: existing.map((pk) => ({
      id: pk.credentialId,
      transports: (pk.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  req.session.webauthnChallenge = options.challenge;
  req.session.webauthnRpId = rpId;
  req.session.webauthnOrigin = origin;

  res.json(options);
});

router.post("/registration/complete", requireAuth(), async (req, res) => {
  const userId = req.session!.userId!;
  const challenge = req.session.webauthnChallenge;
  const rpId = req.session.webauthnRpId;
  const origin = req.session.webauthnOrigin;

  if (!challenge || !rpId || !origin) {
    res.status(400).json({ error: "No pending registration. Please start the registration process again." });
    return;
  }

  delete req.session.webauthnChallenge;
  delete req.session.webauthnRpId;
  delete req.session.webauthnOrigin;

  const labelParsed = z.object({ label: z.string().min(1).max(100).optional() }).safeParse(req.body);
  const label = (labelParsed.success && labelParsed.data.label) ? labelParsed.data.label : "Passkey";

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Passkey registration failed" });
    return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "Passkey registration could not be verified" });
    return;
  }

  const { credential, aaguid } = verification.registrationInfo;
  const lodgeId = await getLodgeId();

  await db.insert(passkeyCredentialsTable).values({
    userId,
    lodgeId: lodgeId!,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: (credential.transports ?? []) as string[],
    aaguid: aaguid ?? null,
    label,
  });

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    action: "PASSKEY_REGISTERED",
    targetType: "user",
    targetId: userId,
    detail: { label, aaguid },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.delete("/:id", requireAuth(), async (req, res) => {
  const passkeyId = req.params.id as string;
  const userId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const existing = await db
    .select()
    .from(passkeyCredentialsTable)
    .where(and(eq(passkeyCredentialsTable.id, passkeyId), eq(passkeyCredentialsTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Passkey not found" });
    return;
  }

  await db.delete(passkeyCredentialsTable).where(eq(passkeyCredentialsTable.id, passkeyId));

  await writeAuditLog({
    lodgeId,
    actorId: userId,
    action: "PASSKEY_REMOVED",
    targetType: "user",
    targetId: userId,
    detail: { label: existing[0].label, passkeyId },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

router.post("/authentication/begin", passkeyRateLimit, async (req, res) => {
  const { rpId, origin } = getWebAuthnConfig(req);

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
  });

  req.session.webauthnChallenge = options.challenge;
  req.session.webauthnRpId = rpId;
  req.session.webauthnOrigin = origin;

  res.json(options);
});

router.post("/authentication/complete", passkeyRateLimit, async (req, res) => {
  const challenge = req.session.webauthnChallenge;
  const rpId = req.session.webauthnRpId;
  const origin = req.session.webauthnOrigin;
  const ip = getClientIp(req);
  const ua = req.headers["user-agent"] ?? null;
  const lodgeId = await getLodgeId();

  if (!challenge || !rpId || !origin) {
    res.status(400).json({ error: "No pending authentication. Please try again." });
    return;
  }

  delete req.session.webauthnChallenge;
  delete req.session.webauthnRpId;
  delete req.session.webauthnOrigin;

  const credentialId: string = req.body?.id;
  if (!credentialId) {
    res.status(400).json({ error: "Invalid passkey response" });
    return;
  }

  const credRows = await db
    .select()
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.credentialId, credentialId))
    .limit(1);

  if (credRows.length === 0) {
    await writeAuditLog({ lodgeId, action: "PASSKEY_LOGIN_FAILED", ipAddress: ip, userAgent: ua, detail: { reason: "credential_not_found" } });
    res.status(401).json({ error: "Passkey not recognised. Please sign in with your password." });
    return;
  }

  const pk = credRows[0];

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      credential: {
        id: pk.credentialId,
        publicKey: Buffer.from(pk.publicKey, "base64url"),
        counter: pk.counter,
        transports: (pk.transports ?? []) as AuthenticatorTransportFuture[],
      },
    });
  } catch (e: any) {
    await writeAuditLog({ lodgeId, actorId: pk.userId, action: "PASSKEY_LOGIN_FAILED", ipAddress: ip, userAgent: ua, detail: { reason: "verification_error", message: e?.message } });
    res.status(401).json({ error: "Passkey verification failed. Please try again." });
    return;
  }

  if (!verification.verified) {
    await writeAuditLog({ lodgeId, actorId: pk.userId, action: "PASSKEY_LOGIN_FAILED", ipAddress: ip, userAgent: ua, detail: { reason: "not_verified" } });
    res.status(401).json({ error: "Passkey not verified. Please try again." });
    return;
  }

  await db
    .update(passkeyCredentialsTable)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeyCredentialsTable.id, pk.id));

  const users = await db.select().from(usersTable).where(eq(usersTable.id, pk.userId)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Your account is inactive. Please contact a lodge administrator." });
    return;
  }
  if (user.membershipStatus === "suspended") {
    res.status(403).json({ error: "Your account is suspended.", reason: "suspended" });
    return;
  }

  const roles = await db
    .select({ name: rolesTable.name, slug: rolesTable.slug, permissionLevel: rolesTable.permissionLevel })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
    .where(eq(userRolesTable.userId, user.id));

  await db.update(usersTable)
    .set({ lastLoginAt: new Date(), lastLoginIp: ip, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  req.session.userId = user.id;
  req.session.lodgeId = user.lodgeId;
  req.session.twoFactorVerified = true;

  await writeAuditLog({
    lodgeId: user.lodgeId,
    actorId: user.id,
    actorEmail: user.email,
    action: "PASSKEY_LOGIN_SUCCESS",
    detail: { label: pk.label, passkeyId: pk.id },
    ipAddress: ip,
    userAgent: ua,
  });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      profileSetupRequired: user.profileSetupRequired,
      roles,
    },
  });
});

router.get("/users/:userId", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = req.params.userId as string;
  const lodgeId = await getLodgeId();

  const userCheck = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetUserId), eq(usersTable.lodgeId, lodgeId!)))
    .limit(1);

  if (userCheck.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const passkeys = await db
    .select({
      id: passkeyCredentialsTable.id,
      label: passkeyCredentialsTable.label,
      aaguid: passkeyCredentialsTable.aaguid,
      transports: passkeyCredentialsTable.transports,
      createdAt: passkeyCredentialsTable.createdAt,
      lastUsedAt: passkeyCredentialsTable.lastUsedAt,
    })
    .from(passkeyCredentialsTable)
    .where(eq(passkeyCredentialsTable.userId, targetUserId))
    .orderBy(desc(passkeyCredentialsTable.createdAt));

  res.json({ passkeys });
});

router.delete("/users/:userId/:passkeyId", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const targetUserId = req.params.userId as string;
  const passkeyId = req.params.passkeyId as string;
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const existing = await db
    .select()
    .from(passkeyCredentialsTable)
    .where(and(eq(passkeyCredentialsTable.id, passkeyId), eq(passkeyCredentialsTable.userId, targetUserId)))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Passkey not found" });
    return;
  }

  await db.delete(passkeyCredentialsTable).where(eq(passkeyCredentialsTable.id, passkeyId));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "PASSKEY_REVOKED_BY_ADMIN",
    targetType: "user",
    targetId: targetUserId,
    detail: { label: existing[0].label, passkeyId },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
