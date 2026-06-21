import { useQuery } from "@tanstack/react-query";

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  preventReuse: boolean;
  historyCount: number;
}

export interface AppPolicy {
  passkeysEnabled: boolean;
  passwordPolicy: PasswordPolicy;
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

const DEFAULT_APP_POLICY: AppPolicy = {
  passkeysEnabled: false,
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
};

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function fetchAppPolicy(): Promise<AppPolicy> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/app-policy`);
    if (!res.ok) return DEFAULT_APP_POLICY;
    return await res.json();
  } catch {
    return DEFAULT_APP_POLICY;
  }
}

export function useAppPolicy() {
  return useQuery<AppPolicy>({
    queryKey: ["app-policy"],
    queryFn: fetchAppPolicy,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_APP_POLICY,
  });
}
