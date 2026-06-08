import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { invitationsTable, usersTable, rolesTable, userRolesTable } from "@workspace/db/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { generateSecureToken } from "../lib/crypto";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { sendEmail, invitationEmailHtml } from "../lib/email";
import { getConfig, getConfigNumber, getLodgeId } from "../lib/config";
import { hashPassword, passwordSchema } from "../lib/password";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router = Router();

const ADMINISTRATOR_LEVEL = 70;

const createInvitationSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleId: z.string().optional(),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

router.post("/", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
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

  const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
  const inviteUrl = `${baseUrl}/accept-invitation?token=${token}`;
  const lodgeName = (await getConfig("lodge_name")) ?? "Member Portal";

  await sendEmail({
    to: normalizedEmail,
    subject: `You have been invited to join ${lodgeName}`,
    html: invitationEmailHtml({ firstName, lodgeName, inviteUrl, expiryDays }),
  });

  res.status(201).json({
    invitation: {
      id: invitation.id,
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      expiresAt: invitation.expiresAt,
    },
  });
});

router.get("/", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
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

  res.json({ invitations });
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
        isNull(invitationsTable.acceptedAt),
        isNull(invitationsTable.revokedAt),
        gt(invitationsTable.expiresAt, new Date()),
        ...(lodgeId ? [eq(invitationsTable.lodgeId, lodgeId)] : [])
      )
    )
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "Invalid or expired invitation" });
    return;
  }

  const invitation = invitations[0];
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
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }

  const { token, password } = result.data;
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const invitations = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.token, token),
        eq(invitationsTable.lodgeId, lodgeId),
        isNull(invitationsTable.acceptedAt),
        isNull(invitationsTable.revokedAt),
        gt(invitationsTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (invitations.length === 0) {
    res.status(404).json({ error: "Invalid or expired invitation" });
    return;
  }

  const invitation = invitations[0];
  const passwordHash = await hashPassword(password);
  const ip = getClientIp(req);

  const [user] = await db
    .insert(usersTable)
    .values({
      lodgeId,
      email: invitation.email,
      emailVerified: true,
      passwordHash,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      isActive: true,
      passwordChangedAt: new Date(),
    })
    .returning();

  if (invitation.roleId) {
    await db.insert(userRolesTable).values({ userId: user.id, roleId: invitation.roleId, grantedBy: invitation.invitedBy });
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
  await writeAuditLog({ lodgeId, actorId: user.id, actorEmail: user.email, action: "USER_ACTIVATED", targetType: "user", targetId: user.id, ipAddress: ip });

  res.status(201).json({ success: true, message: "Account created successfully. You may now log in." });
});

router.delete("/:id", requireAuth(), requireRole(ADMINISTRATOR_LEVEL), async (req, res) => {
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
