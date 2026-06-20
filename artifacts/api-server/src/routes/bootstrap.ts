import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { lodgesTable, configurationTable, rolesTable, protectedDomainsTable, usersTable, userRolesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { hashPassword, passwordSchema } from "../lib/password";
import { writeAuditLog } from "../lib/audit";
import { logger } from "../lib/logger";

const router = Router();

const bootstrapSchema = z.object({
  lodgeName: z.string().min(2).max(200),
  lodgeNumber: z.string().min(1).max(50),
  timezone: z.string().min(1),
  adminEmail: z.string().email(),
  adminFirstName: z.string().min(1).max(100),
  adminLastName: z.string().min(1).max(100),
  adminPassword: passwordSchema,
  smtpHost: z.string().optional(),
  smtpPort: z.string().optional(),
  smtpUser: z.string().optional(),
  smtpFromEmail: z.string().optional(),
  smtpFromName: z.string().optional(),
});

const INITIAL_ROLES = [
  { name: "Visitor", slug: "visitor", permissionLevel: 10, isSystem: true },
  { name: "Member", slug: "member", permissionLevel: 20, isSystem: true },
  { name: "Secretary", slug: "secretary", permissionLevel: 30, isSystem: false },
  { name: "Treasurer", slug: "treasurer", permissionLevel: 30, isSystem: false },
  { name: "Junior Warden", slug: "junior-warden", permissionLevel: 40, isSystem: false },
  { name: "Senior Warden", slug: "senior-warden", permissionLevel: 50, isSystem: false },
  { name: "Worshipful Master", slug: "worshipful-master", permissionLevel: 60, isSystem: false },
  { name: "Past Master", slug: "past-master", permissionLevel: 30, isSystem: false },
  { name: "Site Administrator", slug: "site-administrator", permissionLevel: 80, isSystem: true },
  { name: "PM Super Administrator", slug: "pm-super-administrator", permissionLevel: 90, isSystem: true },
];

const INITIAL_DOMAINS = [
  { name: "Members", slug: "members", description: "General member content" },
  { name: "Officers", slug: "officers", description: "Officer communications and resources" },
  { name: "Administration", slug: "administration", description: "Administrative documents and records" },
  { name: "Financial", slug: "financial", description: "Financial reports and treasurer documents" },
  { name: "Past Masters", slug: "past-masters", description: "Past Masters content and communications" },
];

const DEFAULT_CONFIG = [
  { key: "session_timeout_min", value: "480", description: "Session idle timeout in minutes" },
  { key: "lockout_max_attempts", value: "5", description: "Failed login attempts before lockout" },
  { key: "lockout_duration_min", value: "15", description: "Account lockout duration in minutes" },
  { key: "invite_expiry_days", value: "7", description: "Invitation expiry in days" },
  { key: "reset_expiry_hours", value: "1", description: "Password reset link expiry in hours" },
  { key: "require_2fa_roles", value: "site-administrator,pm-super-administrator", description: "Roles requiring 2FA (comma-separated slugs)" },
];

router.get("/status", async (_req, res) => {
  try {
    const rows = await db.select({ id: lodgesTable.id, name: lodgesTable.name, number: lodgesTable.number }).from(lodgesTable).limit(1);
    if (rows.length === 0) {
      return res.json({ bootstrapped: false });
    }
    const lodge = rows[0];
    const configRows = await db.select({ key: configurationTable.key, value: configurationTable.value })
      .from(configurationTable)
      .where(eq(configurationTable.lodgeId, lodge.id));
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value]));
    res.json({
      bootstrapped: true,
      lodgeName: cfg["lodge_name"] ?? lodge.name,
      lodgeNumber: cfg["lodge_number"] ?? lodge.number,
    });
  } catch {
    res.json({ bootstrapped: false });
  }
});

router.post("/", async (req, res) => {
  const existing = await db.select({ id: lodgesTable.id }).from(lodgesTable).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Portal has already been configured" });
    return;
  }

  const result = bootstrapSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }

  const data = result.data;

  try {
    const [lodge] = await db
      .insert(lodgesTable)
      .values({ name: data.lodgeName, number: data.lodgeNumber })
      .returning();

    type ConfigEntry = { lodgeId: string; key: string; value: string; description: string };
    const configValues: ConfigEntry[] = [
      { lodgeId: lodge.id, key: "lodge_name", value: data.lodgeName, description: "Full lodge name" },
      { lodgeId: lodge.id, key: "lodge_number", value: data.lodgeNumber, description: "Lodge number" },
      { lodgeId: lodge.id, key: "timezone", value: data.timezone, description: "IANA timezone" },
      ...DEFAULT_CONFIG.map((c) => ({ lodgeId: lodge.id, key: c.key, value: c.value, description: c.description })),
    ];

    if (data.smtpHost) configValues.push({ lodgeId: lodge.id, key: "smtp_host", value: data.smtpHost, description: "SMTP server hostname" });
    if (data.smtpPort) configValues.push({ lodgeId: lodge.id, key: "smtp_port", value: data.smtpPort, description: "SMTP port" });
    if (data.smtpUser) configValues.push({ lodgeId: lodge.id, key: "smtp_user", value: data.smtpUser, description: "SMTP username" });
    if (data.smtpFromEmail) configValues.push({ lodgeId: lodge.id, key: "smtp_from_email", value: data.smtpFromEmail, description: "From email address" });
    if (data.smtpFromName) configValues.push({ lodgeId: lodge.id, key: "smtp_from_name", value: data.smtpFromName, description: "From display name" });

    await db.insert(configurationTable).values(configValues);

    const insertedRoles = await db
      .insert(rolesTable)
      .values(INITIAL_ROLES.map((r) => ({ ...r, lodgeId: lodge.id })))
      .returning();

    await db
      .insert(protectedDomainsTable)
      .values(INITIAL_DOMAINS.map((d) => ({ ...d, lodgeId: lodge.id })));

    const pmSuperRole = insertedRoles.find((r) => r.slug === "pm-super-administrator");
    const passwordHash = await hashPassword(data.adminPassword);

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        lodgeId: lodge.id,
        email: data.adminEmail.toLowerCase(),
        emailVerified: true,
        passwordHash,
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
        isActive: true,
        isBootstrapAdmin: true,
        membershipStatus: "active",
        passwordChangedAt: new Date(),
      })
      .returning();

    if (pmSuperRole) {
      await db.insert(userRolesTable).values({ userId: adminUser.id, roleId: pmSuperRole.id, grantedBy: adminUser.id });
    }

    await writeAuditLog({
      lodgeId: lodge.id,
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      action: "MEMBERSHIP_STATUS_CHANGED",
      targetType: "user",
      targetId: adminUser.id,
      detail: { from: "pending", to: "active", source: "bootstrap" },
    });

    await writeAuditLog({
      lodgeId: lodge.id,
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      action: "BOOTSTRAP_COMPLETED",
      detail: { lodgeName: data.lodgeName, lodgeNumber: data.lodgeNumber },
    });

    logger.info({ lodgeId: lodge.id, adminEmail: adminUser.email }, "Bootstrap completed");

    res.status(201).json({
      success: true,
      message: "Portal configured successfully",
      lodge: { id: lodge.id, name: lodge.name, number: lodge.number },
    });
  } catch (err) {
    logger.error({ err }, "Bootstrap failed");
    res.status(500).json({ error: "Bootstrap failed. Please check the logs." });
  }
});

export default router;
