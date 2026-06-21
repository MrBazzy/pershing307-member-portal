import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { invitationsTable, usersTable, rolesTable, userRolesTable } from "@workspace/db/schema";
import { eq, and, isNull, isNotNull, gt, lt, or } from "drizzle-orm";
import { generateSecureToken } from "../lib/crypto";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { sendEmail, invitationEmailHtml } from "../lib/email";
import { getConfig, getConfigNumber, getLodgeId } from "../lib/config";
import { hashPassword, passwordSchema } from "../lib/password";
import { recordPasswordHistory } from "../lib/password-history";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router = Router();

const SITE_ADMIN_LEVEL = 80;

const createInvitationSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleId: z.string().nullable().optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_PASS && process.env.SMTP_HOST);
}

router.post("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const result = createInvitationSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }

  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const { email, firstName, lastName, roleId } = result.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.lodgeId, lodgeId), eq(usersTable.email, normalizedEmail)))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const pendingInvite = await db
    .select({ id: invitationsTable.id })
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.lodgeId, lodgeId),
        eq(invitationsTable.email, normalizedEmail),
        isNull(invitationsTable.acceptedAt),
        isNull(invitationsTable.revokedAt),
        gt(invitationsTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (pendingInvite.length > 0) {
    res.status(409).json({ error: "A pending invitation already exists for this email" });
    return;
  }

  const expiryDays = await getConfigNumber("invite_expiry_days", 7);
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const [invitation] = await db
    .insert(invitationsTable)
    .values({ lodgeId, email: normalizedEmail, firstName, lastName, token, invitedBy: actorId, roleId: roleId ?? null, expiresAt })
    .returning();

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "INVITATION_CREATED",
    targetType: "invitation",
    targetId: invitation.id,
    detail: { email: normalizedEmail, firstName, lastName },
    ipAddress: getClientIp(req),
  });

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/accept-invitation?token=${token}`;
  const lodgeName = (await getConfig("lodge_name")) ?? "Member Portal";
  const smtpOk = isSmtpConfigured();

  if (smtpOk) {
    await sendEmail({
      to: normalizedEmail,
      subject: `You have been invited to join ${lodgeName}`,
      html: invitationEmailHtml({ firstName, lodgeName, inviteUrl, expiryDays }),
    });
  }

  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      expiresAt: invitation.expiresAt,
    },
    smtpConfigured: smtpOk,
  });
});

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const invitations = await db
    .select({
      id: invitationsTable.id,
      email: invitationsTable.email,
      firstName: invitationsTable.firstName,
      lastName: invitationsTable.lastName,
      expiresAt: invitationsTable.expiresAt,
      acceptedAt: invitationsTable.acceptedAt,
      revokedAt: invitationsTable.revokedAt,
      createdAt: invitationsTable.createdAt,
    })
    .from(invitationsTable)
    .where(eq(invitationsTable.lodgeId, lodgeId))
    .orderBy(invitationsTable.createdAt);

  res.json({ invitations, smtpConfigured: isSmtpConfigured() });
});

router.get("/accept/:token", async (req, res) => {
  const { token } = req.params;
  const lodgeId = await getLodgeId();

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.token, token),
        ...(lodgeId ? [eq(invitationsTable.lodgeId, lodgeId)] : [])
      )
    )
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "This invitation link is invalid.", code: "INVALID_TOKEN" });
    return;
  }

  const invitation = invitations[0];

  if (invitation.revokedAt) {
    res.status(410).json({ error: "This invitation has been revoked. Please contact your lodge administrator.", code: "REVOKED" });
    return;
  }
  if (invitation.acceptedAt) {
    res.status(409).json({ error: "This invitation has already been accepted. Please sign in instead.", code: "ALREADY_ACCEPTED" });
    return;
  }
  if (invitation.expiresAt <= new Date()) {
    res.status(410).json({ error: "This invitation has expired. Please request a new one from your lodge administrator.", code: "EXPIRED" });
    return;
  }

  const lodgeName = (await getConfig("lodge_name")) ?? "Member Portal";

  res.json({
    invitation: {
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      lodgeName,
    },
  });
});

router.post("/accept", async (req, res) => {
  const result = acceptInvitationSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", code: "INVALID_REQUEST", issues: result.error.issues });
    return;
  }

  const { token, password } = result.data;
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured", code: "LODGE_NOT_CONFIGURED" });
    return;
  }

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.token, token), eq(invitationsTable.lodgeId, lodgeId)))
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "This invitation link is invalid.", code: "INVALID_TOKEN" });
    return;
  }

  const invitation = invitations[0];

  if (invitation.revokedAt) {
    res.status(410).json({ error: "This invitation has been revoked. Please contact your lodge administrator.", code: "REVOKED" });
    return;
  }
  if (invitation.acceptedAt) {
    res.status(409).json({ error: "This invitation has already been accepted. Please sign in instead.", code: "ALREADY_ACCEPTED" });
    return;
  }
  if (invitation.expiresAt <= new Date()) {
    res.status(410).json({ error: "This invitation has expired. Please request a new one from your lodge administrator.", code: "EXPIRED" });
    return;
  }

  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    res.status(400).json({ error: "Password does not meet the requirements.", code: "PASSWORD_INVALID", issues: passwordCheck.error.issues });
    return;
  }

  const existingUsers = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(and(eq(usersTable.lodgeId, lodgeId), eq(usersTable.email, invitation.email)))
    .limit(1);

  const passwordHash = await hashPassword(password);
  const ip = getClientIp(req);

  let user: typeof usersTable.$inferSelect;

  if (existingUsers.length > 0) {
    const existingUser = existingUsers[0];
    if (existingUser.passwordHash !== null) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in instead.", code: "USER_EXISTS" });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({
        passwordHash,
        emailVerified: true,
        isActive: true,
        membershipStatus: "active",
        mustChangePassword: false,
        profileSetupRequired: true,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existingUser.id))
      .returning();
    user = updated;
  } else {
    try {
      [user] = await db
        .insert(usersTable)
        .values({
          lodgeId,
          email: invitation.email,
          emailVerified: true,
          passwordHash,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          isActive: true,
          membershipStatus: "active",
          mustChangePassword: false,
          profileSetupRequired: true,
          passwordChangedAt: new Date(),
        })
        .returning();
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({ error: "An account with this email already exists. Please sign in instead.", code: "USER_EXISTS" });
        return;
      }
      throw err;
    }
  }

  if (invitation.roleId) {
    await db.insert(userRolesTable)
      .values({ userId: user.id, roleId: invitation.roleId, grantedBy: invitation.invitedBy })
      .onConflictDoNothing();
  }

  await db
    .update(invitationsTable)
    .set({ acceptedAt: new Date(), acceptedByUser: user.id })
    .where(eq(invitationsTable.id, invitation.id));

  await writeAuditLog({
    lodgeId,
    actorId: user.id,
    actorEmail: user.email,
    action: "INVITATION_ACCEPTED",
    targetType: "invitation",
    targetId: invitation.id,
    ipAddress: ip,
  });
  await writeAuditLog({
    lodgeId,
    actorId: user.id,
    actorEmail: user.email,
    action: "MEMBERSHIP_STATUS_CHANGED",
    targetType: "user",
    targetId: user.id,
    detail: { from: "pending", to: "active", source: "invitation_accepted" },
    ipAddress: ip,
  });
  await writeAuditLog({ lodgeId, actorId: user.id, actorEmail: user.email, action: "USER_ACTIVATED", targetType: "user", targetId: user.id, ipAddress: ip });

  res.status(201).json({ success: true, message: "Account created. Please complete your profile setup." });
});

router.delete("/cleanup", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const deleted = await db
    .delete(invitationsTable)
    .where(
      and(
        eq(invitationsTable.lodgeId, lodgeId),
        or(
          isNotNull(invitationsTable.revokedAt),
          and(
            isNull(invitationsTable.acceptedAt),
            lt(invitationsTable.expiresAt, new Date())
          )
        )
      )
    )
    .returning({ id: invitationsTable.id });

  const removed = deleted.length;

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "INVITATIONS_CLEANED_UP",
    targetType: "invitation",
    detail: { removed },
    ipAddress: getClientIp(req),
  });

  res.json({ removed });
});

router.get("/:id/link", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const invitationId = String(req.params.id);
  const lodgeId = await getLodgeId();

  const invitations = await db
    .select({ token: invitationsTable.token, acceptedAt: invitationsTable.acceptedAt, revokedAt: invitationsTable.revokedAt })
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, invitationId), eq(invitationsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  const inv = invitations[0];
  if (inv.acceptedAt || inv.revokedAt) {
    res.status(404).json({ error: "Invitation is no longer active" });
    return;
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/accept-invitation?token=${inv.token}`;

  res.json({ link });
});

router.post("/:id/send", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const invitationId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, invitationId), eq(invitationsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  const invitation = invitations[0];

  if (invitation.acceptedAt) {
    res.status(400).json({ error: "This invitation has already been accepted." });
    return;
  }
  if (invitation.revokedAt) {
    res.status(400).json({ error: "This invitation has been revoked." });
    return;
  }
  if (invitation.expiresAt <= new Date()) {
    res.status(400).json({ error: "This invitation has expired. Please create a new invitation." });
    return;
  }

  const smtpOk = isSmtpConfigured();

  if (smtpOk) {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/accept-invitation?token=${invitation.token}`;
    const lodgeName = (await getConfig("lodge_name")) ?? "Member Portal";
    const expiryDays = Math.max(1, Math.ceil((invitation.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

    await sendEmail({
      to: invitation.email,
      subject: `You have been invited to join ${lodgeName}`,
      html: invitationEmailHtml({ firstName: invitation.firstName, lodgeName, inviteUrl, expiryDays }),
    });
  }

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "INVITATION_SENT",
    targetType: "invitation",
    targetId: invitationId,
    detail: { email: invitation.email },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true, smtpConfigured: smtpOk });
});

router.delete("/:id", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const invitationId = String(req.params.id);
  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(and(eq(invitationsTable.id, invitationId), eq(invitationsTable.lodgeId, lodgeId!)))
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }

  const invitation = invitations[0];
  if (invitation.acceptedAt || invitation.revokedAt) {
    res.status(400).json({ error: "Invitation cannot be revoked" });
    return;
  }

  await db
    .update(invitationsTable)
    .set({ revokedAt: new Date(), revokedBy: actorId })
    .where(eq(invitationsTable.id, invitation.id));

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "INVITATION_REVOKED",
    targetType: "invitation",
    targetId: invitation.id,
    detail: { email: invitation.email },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
