import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PasswordPolicy } from "@/lib/usePasswordPolicy";

interface RequirementProps {
  met: boolean;
  label: string;
}

function Requirement({ met, label }: RequirementProps) {
  return (
    <li className="flex items-center gap-1.5">
      {met ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className={cn("text-xs", met ? "text-green-700" : "text-muted-foreground")}>
        {label}
      </span>
    </li>
  );
}

interface PasswordRequirementsProps {
  password: string;
  policy: PasswordPolicy;
  showHistoryNote?: boolean;
}

export function PasswordRequirements({
  password,
  policy,
  showHistoryNote = false,
}: PasswordRequirementsProps) {
  const hasMinLength = password.length >= policy.minLength;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground mb-1.5">Your password must contain:</p>
      <ul className="space-y-1">
        <Requirement
          met={hasMinLength}
          label={`At least ${policy.minLength} characters`}
        />
        {policy.requireUppercase && (
          <Requirement met={hasUppercase} label="One uppercase letter" />
        )}
        {policy.requireLowercase && (
          <Requirement met={hasLowercase} label="One lowercase letter" />
        )}
        {policy.requireNumber && (
          <Requirement met={hasNumber} label="One number" />
        )}
        {policy.requireSymbol && (
          <Requirement met={hasSymbol} label="One special character" />
        )}
        {showHistoryNote && policy.preventReuse && policy.historyCount > 0 && (
          <li className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0" />
            <span className="text-xs text-muted-foreground">
              Must not match your last {policy.historyCount} password
              {policy.historyCount !== 1 ? "s" : ""}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
