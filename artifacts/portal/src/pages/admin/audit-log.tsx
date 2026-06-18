import { useState, useEffect, useMemo } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import {
  FileText,
  ChevronDown,
  ChevronRight,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditDetail = Record<string, unknown>;
type ResultKind = "success" | "failure" | "warning" | "info";

interface InterpretedLog {
  category: string;
  result: ResultKind;
  summary: string;
  details?: string;
  recommendation?: string;
}

// ─── Interpretation layer ──────────────────────────────────────────────────────

function interpret(
  action: string,
  detail: AuditDetail,
  actorEmail: string | null,
  _targetId: string | null
): InterpretedLog {
  const actor = actorEmail ?? "System";
  const s = (k: string) => (detail[k] as string | undefined) ?? "";
  const n = (k: string) => detail[k] as number | undefined;

  switch (action) {
    // ── Authentication ────────────────────────────────────────────────
    case "LOGIN":
      return { category: "Authentication", result: "success", summary: `${actor} signed in successfully.` };

    case "LOGIN_2FA":
      return {
        category: "Authentication",
        result: "success",
        summary: `${actor} completed two-factor authentication and signed in.`,
      };

    case "LOGOUT":
      return { category: "Authentication", result: "info", summary: `${actor} signed out.` };

    case "LOGIN_FAILED": {
      const reason = s("reason");
      const attempts = n("attempts");
      let details: string;
      let recommendation: string;
      switch (reason) {
        case "user_not_found":
          details = "No account found with this email address.";
          recommendation = "No action needed — the attempt was silently rejected.";
          break;
        case "suspended":
          details = "Account is suspended; login was blocked.";
          recommendation = "Review the account in Users management. Reactivate if appropriate.";
          break;
        case "account_inactive":
          details = "Account exists but has not been activated.";
          recommendation = "Activate the account from the Users management panel.";
          break;
        case "wrong_password":
          details = `Incorrect password entered.${attempts ? ` (Attempt ${attempts} of 5)` : ""}`;
          recommendation =
            "Ask the user to try again or use Forgot Password. After 5 failures the account locks temporarily.";
          break;
        case "temp_password_expired":
          details = "The temporary password issued by an administrator has expired.";
          recommendation = "Issue a new temporary password from the Users management panel.";
          break;
        default:
          details = reason ? `Reason code: ${reason}` : "No reason recorded.";
          recommendation = "Review the account status for this user.";
      }
      return {
        category: "Authentication",
        result: "failure",
        summary: `Failed login attempt for ${actor}.`,
        details,
        recommendation,
      };
    }

    case "LOGIN_LOCKED":
      return {
        category: "Authentication",
        result: "failure",
        summary: `Account temporarily locked for ${actor} after too many failed attempts.`,
        details: "Automatically locked due to excessive failed login attempts.",
        recommendation:
          "The lock clears after the timeout. An administrator can also reactivate the account manually to clear it early.",
      };

    case "RATE_LIMIT_HIT":
      return {
        category: "Authentication",
        result: "warning",
        summary: `Rate limit triggered for ${actor}.`,
        details: "Too many requests were made in a short period.",
        recommendation: "If unexpected, investigate for automated or brute-force activity from this IP.",
      };

    // ── TOTP / 2FA ────────────────────────────────────────────────────
    case "TOTP_FAILED": {
      const attempts = n("attempts");
      const remaining = n("remaining");
      return {
        category: "2FA / TOTP",
        result: "failure",
        summary: `Two-factor authentication code rejected for ${actor}.`,
        details: `Incorrect TOTP code entered.${
          attempts !== undefined
            ? ` Attempt ${attempts}${remaining !== undefined ? `, ${remaining} attempt(s) remaining before lockout.` : "."}`
            : ""
        }`,
        recommendation:
          "Ask the user to check their authenticator app time sync. If locked out, an administrator can disable 2FA so they can re-enrol.",
      };
    }

    case "TOTP_LOCKED":
      return {
        category: "2FA / TOTP",
        result: "failure",
        summary: `Account locked after too many failed 2FA attempts for ${actor}.`,
        details: "Account locked following repeated incorrect TOTP codes.",
        recommendation:
          "An administrator can unlock the account and disable 2FA so the user can re-enrol with a working authenticator.",
      };

    case "2FA_ENROLLED":
      return {
        category: "2FA / TOTP",
        result: "success",
        summary: `${actor} enrolled two-factor authentication.`,
      };

    case "2FA_DISABLED":
      return {
        category: "2FA / TOTP",
        result: "info",
        summary: `Two-factor authentication was disabled for ${actor}.`,
        recommendation: "Encourage the user to re-enrol 2FA for improved account security.",
      };

    // ── Passkeys ──────────────────────────────────────────────────────
    case "PASSKEY_REGISTERED": {
      const label = s("label");
      return {
        category: "Passkeys",
        result: "success",
        summary: `${actor} registered a new passkey${label ? ` labelled "${label}"` : ""}.`,
      };
    }

    case "PASSKEY_REMOVED": {
      const label = s("label");
      return {
        category: "Passkeys",
        result: "info",
        summary: `${actor} removed their passkey${label ? ` "${label}"` : ""}.`,
      };
    }

    case "PASSKEY_LOGIN_SUCCESS":
      return {
        category: "Passkeys",
        result: "success",
        summary: `${actor} signed in successfully using a passkey.`,
      };

    case "PASSKEY_LOGIN_FAILED": {
      const reason = s("reason");
      let details: string;
      let recommendation: string;
      switch (reason) {
        case "credential_not_found":
          details = "The passkey presented by the browser was not found on file.";
          recommendation =
            "Ask the user to register a new passkey from Settings → Passkeys. The old passkey cannot be recovered.";
          break;
        case "verification_error":
          details =
            `Passkey cryptographic verification failed.` +
            (s("message") ? ` Technical detail: ${s("message")}` : "");
          recommendation =
            "This usually means the passkey was created for a different domain or browser. Ask the user to remove the old passkey and register a new one from this portal's URL.";
          break;
        case "not_verified":
          details = "The passkey assertion was rejected by the server during verification.";
          recommendation =
            "Ask the user to try again. If the problem persists, remove the passkey and re-register from this device.";
          break;
        default:
          details = reason ? `Reason: ${reason}` : "No reason recorded.";
          recommendation = "Ask the user to remove and re-register their passkey.";
      }
      return {
        category: "Passkeys",
        result: "failure",
        summary: `Passkey login failed for ${actor}.`,
        details,
        recommendation,
      };
    }

    case "PASSKEY_REVOKED_BY_ADMIN":
      return {
        category: "Passkeys",
        result: "info",
        summary: `An administrator revoked a passkey for ${actor}.`,
        recommendation:
          "If the user needs passkey login, they should register a new one from Settings → Passkeys.",
      };

    // ── Password ──────────────────────────────────────────────────────
    case "PASSWORD_RESET_REQUESTED":
      return {
        category: "Password",
        result: "info",
        summary: `${actor} requested a password reset link.`,
        details: "A reset link was sent to the account email address if it exists.",
      };

    case "PASSWORD_RESET_COMPLETED":
      return {
        category: "Password",
        result: "success",
        summary: `${actor} completed a password reset.`,
      };

    case "PASSWORD_CHANGED":
      return {
        category: "Password",
        result: "success",
        summary: `${actor} changed their password.`,
      };

    case "PASSWORD_CHANGED_AFTER_RESET":
      return {
        category: "Password",
        result: "success",
        summary: `${actor} set a new password after using an administrator-issued temporary password.`,
      };

    case "PASSWORD_RESET_BY_ADMIN": {
      const expiresAt = s("expiresAt");
      return {
        category: "Password",
        result: "info",
        summary: `An administrator issued a temporary password to ${actor}.`,
        details: expiresAt
          ? `Temporary password expires: ${format(new Date(expiresAt), "d MMM yyyy, HH:mm")}.`
          : undefined,
        recommendation: "Deliver the temporary password securely. The user must change it on next login.",
      };
    }

    case "PASSWORD_HISTORY_VIOLATION":
      return {
        category: "Password",
        result: "failure",
        summary: `${actor} attempted to reuse a recent password.`,
        details: "Password change rejected — the new password matches a previously used one.",
        recommendation: "Ask the user to choose a password they have not used before.",
      };

    // ── Users ─────────────────────────────────────────────────────────
    case "USER_ACTIVATED": {
      const sessions = n("sessionsInvalidated");
      return {
        category: "Users",
        result: "success",
        summary: `User account activated.${actor !== "System" ? ` Performed by ${actor}.` : ""}`,
        details: sessions ? `${sessions} existing session(s) were refreshed.` : undefined,
      };
    }

    case "USER_DEACTIVATED": {
      const sessions = n("sessionsInvalidated");
      return {
        category: "Users",
        result: "info",
        summary: `User account deactivated.${actor !== "System" ? ` Performed by ${actor}.` : ""}`,
        details: sessions ? `${sessions} active session(s) were terminated.` : undefined,
        recommendation: "The user cannot log in until the account is reactivated.",
      };
    }

    case "USER_NAME_UPDATED": {
      const from = s("from");
      const to = s("to");
      return {
        category: "Users",
        result: "success",
        summary: `${actor} updated a member's name.`,
        details: from && to ? `Changed from "${from}" to "${to}".` : undefined,
      };
    }

    case "DOB_UPDATED":
      return {
        category: "Users",
        result: "success",
        summary: `Date of birth updated by ${actor}.`,
      };

    case "BIRTHDAY_VISIBILITY_CHANGED": {
      const visibility = s("visibility");
      return {
        category: "Users",
        result: "info",
        summary: `Birthday visibility preference changed by ${actor}.`,
        details: visibility ? `Visibility set to: ${visibility}.` : undefined,
      };
    }

    case "MEMBERSHIP_STATUS_CHANGED": {
      const from = s("from");
      const to = s("to");
      return {
        category: "Users",
        result: "info",
        summary: `Membership status changed.${actor !== "System" ? ` Performed by ${actor}.` : ""}`,
        details: from && to ? `Changed from "${from}" to "${to}".` : to ? `Set to "${to}".` : undefined,
      };
    }

    // ── Roles ─────────────────────────────────────────────────────────
    case "ROLE_GRANTED": {
      const roleName = s("roleName");
      const sessions = n("sessionsInvalidated");
      return {
        category: "Roles",
        result: "success",
        summary: `${actor} granted role "${roleName || "unknown"}".`,
        details: sessions ? `${sessions} session(s) refreshed to apply new permissions.` : undefined,
      };
    }

    case "ROLE_REVOKED": {
      const roleName = s("roleName");
      const sessions = n("sessionsInvalidated");
      return {
        category: "Roles",
        result: "info",
        summary: `${actor} revoked role "${roleName || "unknown"}".`,
        details: sessions ? `${sessions} session(s) refreshed to apply permission changes.` : undefined,
      };
    }

    // ── Invitations ───────────────────────────────────────────────────
    case "INVITATION_CREATED": {
      const email = s("email");
      const firstName = s("firstName");
      const lastName = s("lastName");
      const name = [firstName, lastName].filter(Boolean).join(" ");
      return {
        category: "Invitations",
        result: "success",
        summary: `${actor} created an invitation for ${name ? `${name} (${email})` : email || "a new member"}.`,
        details: "An invitation email was sent if SMTP is configured.",
      };
    }

    case "INVITATION_ACCEPTED": {
      const email = s("email");
      return {
        category: "Invitations",
        result: "success",
        summary: `Invitation accepted${email ? ` by ${email}` : ""}.`,
        details: "The user's account has been activated.",
      };
    }

    case "INVITATION_REVOKED": {
      const email = s("email");
      return {
        category: "Invitations",
        result: "info",
        summary: `Invitation revoked${email ? ` for ${email}` : ""} by ${actor}.`,
        details: "The invitation link is no longer valid.",
      };
    }

    case "INVITATIONS_CLEANED_UP": {
      const count = n("count");
      return {
        category: "Invitations",
        result: "info",
        summary: `Expired invitations cleaned up${count !== undefined ? ` — ${count} removed` : ""}.`,
      };
    }

    // ── Degrees ───────────────────────────────────────────────────────
    case "DEGREE_RECORDED": {
      const degreeName = s("degreeName");
      const conferredOn = s("conferredOn");
      return {
        category: "Degrees",
        result: "success",
        summary: `${actor} recorded degree: ${degreeName || `Degree ${n("degree") ?? ""}`}.`,
        details: conferredOn
          ? `Conferred on ${format(new Date(conferredOn), "d MMM yyyy")}.`
          : undefined,
      };
    }

    case "DEGREE_REMOVED": {
      const degree = n("degree");
      return {
        category: "Degrees",
        result: "info",
        summary: `${actor} removed a degree record${degree ? ` (Degree ${degree})` : ""}.`,
      };
    }

    // ── Access / Domains ──────────────────────────────────────────────
    case "DOMAIN_ACCESS_GRANTED": {
      const domainName = s("domainName");
      return {
        category: "Access",
        result: "success",
        summary: `${actor} granted domain access: ${domainName || "unknown domain"}.`,
      };
    }

    case "DOMAIN_ACCESS_REVOKED": {
      const domainName = s("domainName");
      return {
        category: "Access",
        result: "info",
        summary: `${actor} revoked domain access: ${domainName || "unknown domain"}.`,
      };
    }

    // ── Roadmap / Lodge Years ─────────────────────────────────────────
    case "ROADMAP_ITEM_CREATED":
      return { category: "Roadmap", result: "success", summary: `${actor} created a new roadmap item.` };
    case "ROADMAP_ITEM_UPDATED":
      return { category: "Roadmap", result: "info", summary: `${actor} updated a roadmap item.` };
    case "ROADMAP_ITEM_DELETED":
      return { category: "Roadmap", result: "info", summary: `${actor} deleted a roadmap item.` };
    case "LODGE_YEAR_CREATED":
      return { category: "Roadmap", result: "success", summary: `${actor} created a new lodge year.` };
    case "LODGE_YEAR_ACTIVATED": {
      const year = s("year");
      return { category: "Roadmap", result: "success", summary: `${actor} activated lodge year${year ? ` ${year}` : ""}.` };
    }
    case "LODGE_YEAR_ARCHIVED": {
      const year = s("year");
      return { category: "Roadmap", result: "info", summary: `${actor} archived lodge year${year ? ` ${year}` : ""}.` };
    }
    case "LODGE_YEAR_RESTORED": {
      const year = s("year");
      return { category: "Roadmap", result: "info", summary: `${actor} restored lodge year${year ? ` ${year}` : ""}.` };
    }
    case "LODGE_YEAR_UPDATED":
      return { category: "Roadmap", result: "info", summary: `${actor} updated a lodge year.` };
    case "LODGE_YEAR_DELETED":
      return { category: "Roadmap", result: "info", summary: `${actor} deleted a lodge year.` };

    // ── Tracing Board ─────────────────────────────────────────────────
    case "TB_ENTRY_CREATED":
      return { category: "Tracing Board", result: "success", summary: `${actor} created a tracing board entry.` };
    case "TB_ENTRY_UPDATED":
      return { category: "Tracing Board", result: "info", summary: `${actor} updated a tracing board entry.` };
    case "TB_ENTRY_DELETED":
      return { category: "Tracing Board", result: "info", summary: `${actor} deleted a tracing board entry.` };
    case "TB_CATEGORY_CREATED":
      return { category: "Tracing Board", result: "success", summary: `${actor} created a tracing board category.` };
    case "TB_CATEGORY_UPDATED":
      return { category: "Tracing Board", result: "info", summary: `${actor} updated a tracing board category.` };
    case "TB_CATEGORY_DISABLED":
      return { category: "Tracing Board", result: "info", summary: `${actor} disabled a tracing board category.` };
    case "TB_CATEGORY_REORDERED":
      return { category: "Tracing Board", result: "info", summary: `${actor} reordered tracing board categories.` };
    case "TB_CATEGORY_DELETED":
      return { category: "Tracing Board", result: "info", summary: `${actor} deleted a tracing board category.` };

    // ── Events ────────────────────────────────────────────────────────
    case "EVENT_CREATED": {
      const title = s("title");
      return { category: "Events", result: "success", summary: `${actor} created event${title ? ` "${title}"` : ""}.` };
    }
    case "EVENT_UPDATED": {
      const title = s("title");
      return { category: "Events", result: "info", summary: `${actor} updated event${title ? ` "${title}"` : ""}.` };
    }
    case "EVENT_DELETED":
      return { category: "Events", result: "info", summary: `${actor} deleted an event.` };
    case "EVENT_CATEGORY_CREATED":
      return { category: "Events", result: "success", summary: `${actor} created an event category.` };
    case "EVENT_CATEGORY_UPDATED":
      return { category: "Events", result: "info", summary: `${actor} updated an event category.` };
    case "EVENT_CATEGORY_DISABLED":
      return { category: "Events", result: "info", summary: `${actor} disabled an event category.` };
    case "EVENT_CATEGORY_REORDERED":
      return { category: "Events", result: "info", summary: `${actor} reordered event categories.` };
    case "EVENT_CATEGORY_DELETED":
      return { category: "Events", result: "info", summary: `${actor} deleted an event category.` };

    // ── History ───────────────────────────────────────────────────────
    case "HISTORY_SECTION_CREATED":
      return { category: "History", result: "success", summary: `${actor} created a history section.` };
    case "HISTORY_SECTIONS_REORDERED":
      return { category: "History", result: "info", summary: `${actor} reordered history sections.` };
    case "HISTORY_SECTION_UPDATED":
      return { category: "History", result: "info", summary: `${actor} updated a history section.` };
    case "HISTORY_SECTION_DELETED":
      return { category: "History", result: "info", summary: `${actor} deleted a history section.` };
    case "HISTORY_TIMELINE_CREATED":
      return { category: "History", result: "success", summary: `${actor} added a history timeline entry.` };
    case "HISTORY_TIMELINE_UPDATED":
      return { category: "History", result: "info", summary: `${actor} updated a history timeline entry.` };
    case "HISTORY_TIMELINE_DELETED":
      return { category: "History", result: "info", summary: `${actor} deleted a history timeline entry.` };
    case "HISTORY_DOCUMENT_CREATED":
      return { category: "History", result: "success", summary: `${actor} uploaded a history document.` };
    case "HISTORY_DOCUMENT_UPDATED":
      return { category: "History", result: "info", summary: `${actor} updated a history document.` };
    case "HISTORY_DOCUMENT_DELETED":
      return { category: "History", result: "info", summary: `${actor} deleted a history document.` };
    case "HISTORY_PAGE_UPDATED":
      return { category: "History", result: "info", summary: `${actor} updated the history page content.` };
    case "PERSHING_BIO_UPDATED":
      return { category: "History", result: "info", summary: `${actor} updated the General Pershing biography.` };

    // ── System / Config ───────────────────────────────────────────────
    case "BOOTSTRAP_COMPLETED":
      return {
        category: "System",
        result: "success",
        summary: "Initial portal setup completed.",
        details: "The lodge portal was bootstrapped for the first time.",
      };

    case "CONFIG_CHANGED": {
      const key = s("key");
      return {
        category: "System",
        result: "info",
        summary: `${actor} changed configuration setting${key ? ` "${key}"` : ""}.`,
      };
    }

    case "SMTP_TEST":
      return {
        category: "System",
        result: "info",
        summary: `${actor} sent a test email to verify SMTP configuration.`,
      };

    case "TEST_USER_RESET": {
      const email = s("email");
      const name = s("name");
      return {
        category: "System",
        result: "info",
        summary: `Test user${name ? ` ${name}` : email ? ` (${email})` : ""} was removed for re-testing purposes.`,
        details: "Only available in development environments.",
      };
    }

    default:
      return {
        category: "Other",
        result: "info",
        summary: action.replace(/_/g, " "),
      };
  }
}

// ─── Category colours ─────────────────────────────────────────────────────────

const CATEGORY_BADGE: Record<string, string> = {
  Authentication:   "bg-blue-50 text-blue-700 border-blue-200",
  "Passkeys":       "bg-indigo-50 text-indigo-700 border-indigo-200",
  "2FA / TOTP":     "bg-violet-50 text-violet-700 border-violet-200",
  Password:         "bg-amber-50 text-amber-700 border-amber-200",
  Users:            "bg-teal-50 text-teal-700 border-teal-200",
  Roles:            "bg-purple-50 text-purple-700 border-purple-200",
  Invitations:      "bg-sky-50 text-sky-700 border-sky-200",
  Degrees:          "bg-orange-50 text-orange-700 border-orange-200",
  Access:           "bg-rose-50 text-rose-700 border-rose-200",
  Roadmap:          "bg-lime-50 text-lime-700 border-lime-200",
  "Tracing Board":  "bg-cyan-50 text-cyan-700 border-cyan-200",
  Events:           "bg-pink-50 text-pink-700 border-pink-200",
  History:          "bg-yellow-50 text-yellow-700 border-yellow-200",
  System:           "bg-gray-50 text-gray-600 border-gray-200",
  Other:            "bg-muted text-muted-foreground border-border",
};

const CATEGORIES = [
  "Authentication", "Passkeys", "2FA / TOTP", "Password",
  "Users", "Roles", "Invitations", "Degrees", "Access",
  "Roadmap", "Tracing Board", "Events", "History", "System",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultIcon({ result }: { result: ResultKind }) {
  switch (result) {
    case "success": return <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />;
    case "failure": return <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    default:        return <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />;
  }
}

interface LogEntry {
  id: string;
  action: string;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

function AuditRow({ log, expanded, onToggle }: {
  log: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const interp = useMemo(
    () => interpret(log.action, (log.detail ?? {}) as AuditDetail, log.actorEmail ?? null, log.targetId ?? null),
    [log.action, log.detail, log.actorEmail, log.targetId]
  );

  const hasExpanded = !!(interp.details || interp.recommendation || log.ipAddress);
  const categoryBadgeCls = CATEGORY_BADGE[interp.category] ?? CATEGORY_BADGE.Other;

  return (
    <>
      <tr
        className={`hover:bg-muted/20 transition-colors ${hasExpanded ? "cursor-pointer" : ""}`}
        onClick={hasExpanded ? onToggle : undefined}
        data-testid={`audit-log-row-${log.id}`}
      >
        {/* Expand toggle */}
        <td className="pl-3 pr-1 py-2.5 w-6">
          {hasExpanded ? (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <span className="w-3.5 h-3.5 block" />
          )}
        </td>

        {/* Result icon */}
        <td className="px-2 py-2.5 w-6">
          <ResultIcon result={interp.result} />
        </td>

        {/* Summary */}
        <td className="px-2 py-2.5">
          <p className="text-sm text-foreground leading-snug">{interp.summary}</p>
          {/* On mobile, show timestamp below summary */}
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 md:hidden">
            {format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss")}
          </p>
        </td>

        {/* Category badge */}
        <td className="px-2 py-2.5 hidden sm:table-cell w-36">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${categoryBadgeCls}`}>
            {interp.category}
          </span>
        </td>

        {/* Timestamp */}
        <td className="px-2 py-2.5 hidden md:table-cell w-40 text-right">
          <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
            {format(new Date(log.createdAt), "d MMM yyyy")}
            <br />
            <span className="text-[10px]">{format(new Date(log.createdAt), "HH:mm:ss")}</span>
          </span>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && hasExpanded && (
        <tr className="bg-muted/30 border-t border-border/40">
          <td colSpan={5} className="px-10 py-3">
            <div className="space-y-2 max-w-2xl">
              {interp.details && (
                <div className="flex gap-2 text-sm text-foreground/80">
                  <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p>{interp.details}</p>
                </div>
              )}
              {interp.recommendation && (
                <div className="flex gap-2 text-sm text-amber-800">
                  <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p><span className="font-medium">Recommended action:</span> {interp.recommendation}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[10px] text-muted-foreground font-mono">
                {log.targetId && (
                  <span>Target ID: {log.targetId}</span>
                )}
                {log.targetType && (
                  <span>Target type: {log.targetType}</span>
                )}
                {log.ipAddress && (
                  <span>IP: {log.ipAddress}</span>
                )}
                <span>Action code: {log.action}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FETCH_LIMIT = 500;
const DISPLAY_PAGE = 50;

export default function AdminAuditLogPage() {
  const [actorInput, setActorInput] = useState("");
  const [actorDebounced, setActorDebounced] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(DISPLAY_PAGE);

  // Debounce actor email
  useEffect(() => {
    const t = setTimeout(() => setActorDebounced(actorInput), 450);
    return () => clearTimeout(t);
  }, [actorInput]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(DISPLAY_PAGE);
    setExpandedId(null);
  }, [actorDebounced, categoryFilter, resultFilter, fromDate, toDate]);

  const apiParams = {
    limit: FETCH_LIMIT,
    offset: 0,
    ...(actorDebounced ? { actorEmail: actorDebounced } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: `${toDate}T23:59:59` } : {}),
  };

  const { data, isLoading } = useListAuditLogs(apiParams, {
    query: { queryKey: getListAuditLogsQueryKey(apiParams), staleTime: 30_000 },
  });

  const allLogs = data?.logs ?? [];

  // Client-side filter by category + result
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (categoryFilter !== "all" || resultFilter !== "all") {
        const interp = interpret(
          log.action,
          (log.detail ?? {}) as AuditDetail,
          log.actorEmail ?? null,
          log.targetId ?? null
        );
        if (categoryFilter !== "all" && interp.category !== categoryFilter) return false;
        if (resultFilter === "success" && interp.result !== "success") return false;
        if (resultFilter === "failure" && interp.result !== "failure") return false;
      }
      return true;
    });
  }, [allLogs, categoryFilter, resultFilter]);

  const displayedLogs = filteredLogs.slice(0, displayCount);
  const hasMore = filteredLogs.length > displayCount;

  const hasActiveFilters =
    actorInput !== "" || categoryFilter !== "all" || resultFilter !== "all" || fromDate !== "" || toDate !== "";

  function clearFilters() {
    setActorInput("");
    setActorDebounced("");
    setCategoryFilter("all");
    setResultFilter("all");
    setFromDate("");
    setToDate("");
  }

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-serif font-semibold">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Complete record of security and administrative events
            </p>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm p-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {/* Actor email search */}
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search by actor email…"
                value={actorInput}
                onChange={(e) => setActorInput(e.target.value)}
              />
            </div>

            {/* Category */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-sm w-44">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>

            {/* Result */}
            <Select value={resultFilter} onValueChange={setResultFilter}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue placeholder="All results" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="success">Success only</SelectItem>
                <SelectItem value="failure">Failures only</SelectItem>
              </SelectContent>
            </Select>

            {/* Date from */}
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Date to */}
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Results summary */}
          {!isLoading && (
            <p className="text-[11px] text-muted-foreground mt-2 pl-0.5">
              {filteredLogs.length === 0
                ? "No entries match the current filters."
                : `Showing ${Math.min(displayCount, filteredLogs.length)} of ${filteredLogs.length} matching entries`}
              {allLogs.length === FETCH_LIMIT && (
                <span className="ml-1">(server limit reached — narrow date range or actor filter to see older entries)</span>
              )}
            </p>
          )}
        </div>

        {/* Log table */}
        <div className="bg-card border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="pl-3 pr-1 py-3 w-6" />
                <th className="px-2 py-3 w-6" />
                <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Description
                </th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                  Category
                </th>
                <th className="px-2 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="pl-3 py-3 w-6" />
                      <td className="px-2 py-3 w-6">
                        <Skeleton className="h-4 w-4 rounded-full" />
                      </td>
                      <td className="px-2 py-3">
                        <Skeleton className="h-4 w-64" />
                      </td>
                      <td className="px-2 py-3 hidden sm:table-cell">
                        <Skeleton className="h-4 w-24 rounded" />
                      </td>
                      <td className="px-2 py-3 hidden md:table-cell">
                        <Skeleton className="h-4 w-20 ml-auto" />
                      </td>
                    </tr>
                  ))
                : displayedLogs.map((log) => (
                    <AuditRow
                      key={log.id}
                      log={log as LogEntry}
                      expanded={expandedId === log.id}
                      onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    />
                  ))}
            </tbody>
          </table>

          {!isLoading && filteredLogs.length === 0 && (
            <div className="px-4 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {hasActiveFilters ? "No entries match the current filters." : "No audit log entries yet."}
              </p>
            </div>
          )}

          {!isLoading && hasMore && (
            <div className="px-4 py-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => setDisplayCount((c) => c + DISPLAY_PAGE)}
                data-testid="button-load-more"
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Show more ({filteredLogs.length - displayCount} remaining)
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
