import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useListConfig,
  useUpdateConfig,
  useTestSmtp,
  getListConfigQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Lock,
  Save,
  Info,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Mail,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const updateSchema = z.object({ value: z.string() });
type UpdateValues = z.infer<typeof updateSchema>;

const testSchema = z.object({ to: z.string().email("Enter a valid email address") });
type TestValues = z.infer<typeof testSchema>;

interface SmtpTestState {
  success: boolean;
  message: string;
  diagnostics?: {
    smtpPassConfigured: boolean;
    host?: string | null;
    port?: number;
    username?: string | null;
    fromAddress?: string | null;
    secure?: boolean;
  };
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: string;
  smtpResponse?: string;
  smtpCommand?: string;
}

const KEY_INPUT_TYPES: Record<string, string> = {
  smtp_port: "number",
  smtp_from_email: "email",
  smtp_reply_to: "email",
  session_timeout_min: "number",
  lockout_max_attempts: "number",
  lockout_duration_min: "number",
  invite_expiry_days: "number",
  reset_expiry_hours: "number",
};

const KEY_LABELS: Record<string, string> = {
  lodge_name: "Lodge Name",
  lodge_number: "Lodge Number",
  lodge_timezone: "Timezone",
  smtp_host: "SMTP Host",
  smtp_port: "SMTP Port",
  smtp_user: "SMTP Username",
  smtp_from_email: "From Address",
  smtp_from_name: "From Name",
  smtp_reply_to: "Reply-To Address",
  session_timeout_min: "Session Timeout (min)",
  lockout_max_attempts: "Max Login Attempts",
  lockout_duration_min: "Lockout Duration (min)",
  invite_expiry_days: "Invitation Expiry (days)",
  reset_expiry_hours: "Password Reset Expiry (hrs)",
  require_2fa_roles: "Roles Requiring 2FA",
};

function ConfigRow({
  entry,
  onSave,
  requiresConfirmation = false,
}: {
  entry: { key: string; value: string | null; description: string; isReadOnly: boolean };
  onSave: (key: string, value: string) => Promise<void>;
  requiresConfirmation?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(null);

  const form = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { value: entry.value ?? "" },
  });

  const doSave = async (value: string) => {
    setSaving(true);
    try {
      await onSave(entry.key, value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (values: UpdateValues) => {
    if (requiresConfirmation) {
      setPendingValue(values.value);
      setConfirmOpen(true);
    } else {
      await doSave(values.value);
    }
  };

  const label = KEY_LABELS[entry.key] ?? entry.key;
  const inputType = KEY_INPUT_TYPES[entry.key] ?? "text";

  return (
    <>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm lodge information change</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You are changing <strong className="text-foreground">{label}</strong>. This
                  affects all members and the portal's public identity.
                </p>
                <div className="rounded-md border bg-muted/50 px-3 py-2 space-y-1 font-mono text-xs">
                  <div>
                    <span className="text-muted-foreground">Current: </span>
                    <span className="text-foreground">{entry.value || "(not set)"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">New:&nbsp;&nbsp;&nbsp;&nbsp; </span>
                    <span className="text-foreground font-semibold">{pendingValue || "(empty)"}</span>
                  </div>
                </div>
                <p>Are you sure you want to proceed?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async () => {
                setConfirmOpen(false);
                if (pendingValue !== null) await doSave(pendingValue);
              }}
            >
              {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Confirm Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="py-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{label}</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                {entry.key}
              </code>
              {entry.isReadOnly && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  Read-only
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{entry.description}</p>
          </div>

          {!entry.isReadOnly && !editing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                form.reset({ value: entry.value ?? "" });
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="flex gap-2 mt-2">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input {...field} type={inputType} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </form>
          </Form>
        ) : (
          <p className="text-sm font-mono">
            {entry.value ? (
              <span className="text-foreground">{entry.value}</span>
            ) : (
              <span className="text-muted-foreground italic">
                {entry.isReadOnly ? "Not set" : "Using default"}
              </span>
            )}
          </p>
        )}
      </div>
    </>
  );
}

function SmtpPasswordRow({ configured }: { configured: boolean }) {
  return (
    <div className="py-4 space-y-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">SMTP Password</span>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
            SMTP_PASS
          </code>
          <Badge
            variant="outline"
            className="text-xs gap-1 border-amber-300 text-amber-700 bg-amber-50"
          >
            <ShieldAlert className="h-2.5 w-2.5" />
            Replit Secret only
          </Badge>
          {configured ? (
            <Badge
              variant="outline"
              className="text-xs gap-1 border-green-300 text-green-700 bg-green-50"
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              Configured
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs gap-1 border-red-300 text-red-700 bg-red-50"
            >
              <XCircle className="h-2.5 w-2.5" />
              Not configured
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The SMTP password is managed as the{" "}
          <code className="font-mono">SMTP_PASS</code> Replit Secret — it is
          never stored in the database and cannot be set here. Add or update it
          in the <strong>Secrets</strong> tab of your Replit workspace, then
          restart the API Server.
        </p>
      </div>
    </div>
  );
}

function DiagnosticsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-xs font-mono break-all">{value}</span>
    </div>
  );
}

function SmtpDiagnosticsPanel({ result }: { result: SmtpTestState }) {
  const d = result.diagnostics;

  const passEl = d?.smtpPassConfigured ? (
    <span className="text-green-700">Yes</span>
  ) : (
    <span className="text-red-700">No — add SMTP_PASS in Replit Secrets</span>
  );

  const secureEl = d?.secure != null ? (
    d.secure
      ? <span>Yes <span className="text-muted-foreground">(port 465, SSL/TLS)</span></span>
      : <span>No <span className="text-muted-foreground">(port 587/25, STARTTLS)</span></span>
  ) : "—";

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2.5 mt-2 space-y-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        SMTP Diagnostics
      </p>
      <DiagnosticsRow label="SMTP_PASS set" value={passEl} />
      <DiagnosticsRow label="Host" value={d?.host ?? "—"} />
      <DiagnosticsRow label="Port" value={d?.port ?? "—"} />
      <DiagnosticsRow label="Username" value={d?.username ?? "—"} />
      <DiagnosticsRow label="From address" value={d?.fromAddress ?? "—"} />
      <DiagnosticsRow label="Secure (SSL/TLS)" value={secureEl} />
      {!result.success && (
        <>
          <Separator className="my-1.5" />
          <DiagnosticsRow
            label="Error category"
            value={
              result.errorCategory ? (
                <span className="text-red-700">{result.errorCategory.replace(/_/g, " ")}</span>
              ) : "—"
            }
          />
          <DiagnosticsRow
            label="Error code"
            value={result.errorCode ? <span className="text-red-700">{result.errorCode}</span> : "—"}
          />
          {result.smtpCommand && (
            <DiagnosticsRow label="SMTP command" value={result.smtpCommand} />
          )}
          {result.smtpResponse && (
            <DiagnosticsRow label="Server response" value={result.smtpResponse} />
          )}
          {result.errorMessage && !result.smtpResponse && (
            <DiagnosticsRow label="Error detail" value={result.errorMessage} />
          )}
        </>
      )}
    </div>
  );
}

function SendTestEmailSection() {
  const { toast } = useToast();
  const testSmtp = useTestSmtp();
  const [testResult, setTestResult] = useState<SmtpTestState | null>(null);

  const form = useForm<TestValues>({
    resolver: zodResolver(testSchema),
    defaultValues: { to: "" },
  });

  const handleSend = (values: TestValues) => {
    setTestResult(null);
    testSmtp.mutate(
      { data: { to: values.to } },
      {
        onSuccess: (data) => {
          setTestResult({
            success: true,
            message: data.message,
            diagnostics: data.diagnostics,
          });
        },
        onError: (e: any) => {
          const d = e?.data;
          if (e?.status === 503) {
            toast({
              title: "SMTP not configured",
              description: d?.error ?? "Set smtp_host and SMTP_PASS before testing.",
              variant: "destructive",
            });
            return;
          }
          setTestResult({
            success: false,
            message: d?.message ?? d?.details ?? d?.error ?? "SMTP test failed.",
            diagnostics: d?.diagnostics,
            errorCode: d?.errorCode,
            errorMessage: d?.errorMessage,
            errorCategory: d?.errorCategory,
            smtpResponse: d?.smtpResponse,
            smtpCommand: d?.smtpCommand,
          });
        },
      }
    );
  };

  return (
    <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md px-4 pb-4">
      <div className="py-3 flex items-center gap-1.5">
        <Send className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Send Test Email
        </h2>
      </div>
      <Separator />
      <div className="pt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Verify your SMTP configuration by sending a test message. The result
          is recorded in the Audit Log.
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSend)} className="flex gap-2">
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="recipient@example.com"
                      autoComplete="email"
                      onChange={(e) => {
                        field.onChange(e);
                        setTestResult(null);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={testSmtp.isPending}>
              {testSmtp.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send
            </Button>
          </form>
        </Form>

        {testResult && (
          <div>
            <div
              className={`rounded-md border px-3 py-2.5 text-sm flex items-start gap-2.5 ${
                testResult.success
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.diagnostics && (
              <SmtpDiagnosticsPanel result={testResult} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminConfigPage() {
  const { data, isLoading } = useListConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateConfig();

  const config = data?.config ?? [];
  const smtpPasswordConfigured = data?.smtpPasswordConfigured ?? false;

  const lodgeEntries = config.filter((c) =>
    ["lodge_name", "lodge_number", "lodge_timezone"].includes(c.key)
  );
  const smtpEntries = config.filter((c) =>
    [
      "smtp_host",
      "smtp_port",
      "smtp_user",
      "smtp_from_email",
      "smtp_from_name",
      "smtp_reply_to",
    ].includes(c.key)
  );
  const sessionEntries = config.filter((c) =>
    ["session_timeout_min", "lockout_max_attempts", "lockout_duration_min"].includes(c.key)
  );
  const securityEntries = config.filter((c) => ["require_2fa_roles"].includes(c.key));
  const inviteEntries = config.filter((c) =>
    ["invite_expiry_days", "reset_expiry_hours"].includes(c.key)
  );

  const handleSave = async (key: string, value: string) => {
    return new Promise<void>((resolve, reject) => {
      updateMutation.mutate(
        { key, data: { value } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListConfigQueryKey() });
            toast({ title: "Configuration updated" });
            resolve();
          },
          onError: (e: any) => {
            toast({
              title: "Error",
              description: e?.data?.error ?? "Failed to update configuration",
              variant: "destructive",
            });
            reject(e);
          },
        }
      );
    });
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-primary flex items-center gap-2">
            <Settings className="h-6 w-6" /> Configuration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage portal settings. SMTP password is a Replit Secret and is
            never stored in the database.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md px-4">
              <div className="py-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Lodge Information
                </h2>
                <Badge
                  variant="outline"
                  className="text-xs gap-1 ml-auto border-blue-200 text-blue-700 bg-blue-50"
                >
                  <Info className="h-2.5 w-2.5" />
                  Confirmation required
                </Badge>
              </div>
              <Separator />
              <div className="divide-y">
                {lodgeEntries.map((entry) => (
                  <ConfigRow
                    key={entry.key}
                    entry={entry}
                    onSave={handleSave}
                    requiresConfirmation
                  />
                ))}
              </div>
            </div>

            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md px-4">
              <div className="py-3 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Email Configuration
                </h2>
              </div>
              <Separator />
              <div className="divide-y">
                {smtpEntries.map((entry) => (
                  <ConfigRow key={entry.key} entry={entry} onSave={handleSave} />
                ))}
                <SmtpPasswordRow configured={smtpPasswordConfigured} />
              </div>
            </div>

            <SendTestEmailSection />

            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md px-4">
              <h2 className="text-sm font-semibold py-3 text-muted-foreground uppercase tracking-wide">
                Session &amp; Lockout
              </h2>
              <Separator />
              <div className="divide-y">
                {sessionEntries.map((entry) => (
                  <ConfigRow key={entry.key} entry={entry} onSave={handleSave} />
                ))}
              </div>
            </div>

            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md px-4">
              <h2 className="text-sm font-semibold py-3 text-muted-foreground uppercase tracking-wide">
                Security
              </h2>
              <Separator />
              <div className="divide-y">
                {securityEntries.map((entry) => (
                  <ConfigRow key={entry.key} entry={entry} onSave={handleSave} />
                ))}
              </div>
            </div>

            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md px-4">
              <h2 className="text-sm font-semibold py-3 text-muted-foreground uppercase tracking-wide">
                Invitations
              </h2>
              <Separator />
              <div className="divide-y">
                {inviteEntries.map((entry) => (
                  <ConfigRow key={entry.key} entry={entry} onSave={handleSave} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Changes take effect after the next request.
              </p>
              <p className="text-xs">
                Session timeout changes apply to new sessions only. To force
                existing sessions to expire, restart the API server.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
