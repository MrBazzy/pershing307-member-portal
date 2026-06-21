import { z } from "zod";
import { getConfig } from "./config";

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  preventReuse: boolean;
  historyCount: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  preventReuse: true,
  historyCount: 5,
};

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const [minLengthStr, uppercase, lowercase, number_, symbol, preventReuse, historyCountStr] =
    await Promise.all([
      getConfig("password_min_length"),
      getConfig("password_require_uppercase"),
      getConfig("password_require_lowercase"),
      getConfig("password_require_number"),
      getConfig("password_require_symbol"),
      getConfig("password_prevent_reuse"),
      getConfig("password_history_count"),
    ]);

  const minLength = minLengthStr !== null ? parseInt(minLengthStr, 10) : DEFAULT_PASSWORD_POLICY.minLength;
  const historyCount =
    historyCountStr !== null ? parseInt(historyCountStr, 10) : DEFAULT_PASSWORD_POLICY.historyCount;

  return {
    minLength: isNaN(minLength)
      ? DEFAULT_PASSWORD_POLICY.minLength
      : Math.max(8, Math.min(32, minLength)),
    requireUppercase:
      uppercase !== null ? uppercase === "true" : DEFAULT_PASSWORD_POLICY.requireUppercase,
    requireLowercase:
      lowercase !== null ? lowercase === "true" : DEFAULT_PASSWORD_POLICY.requireLowercase,
    requireNumber: number_ !== null ? number_ === "true" : DEFAULT_PASSWORD_POLICY.requireNumber,
    requireSymbol: symbol !== null ? symbol === "true" : DEFAULT_PASSWORD_POLICY.requireSymbol,
    preventReuse:
      preventReuse !== null ? preventReuse === "true" : DEFAULT_PASSWORD_POLICY.preventReuse,
    historyCount: isNaN(historyCount)
      ? DEFAULT_PASSWORD_POLICY.historyCount
      : Math.max(0, Math.min(12, historyCount)),
  };
}

export function validatePasswordAgainstPolicy(
  password: string,
  policy: PasswordPolicy
): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one digit");
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }
  return errors;
}

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export async function hashPassword(password: string): Promise<string> {
  const argon2 = await import("argon2");
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const argon2 = await import("argon2");
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
