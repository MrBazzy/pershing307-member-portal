import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useListConfig, useUpdateConfig, getListConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, Lock, Key, Save, Info, Loader2, AlertTriangle } from "lucide-react";

const updateSchema = z.object({ value: z.string() });
type UpdateValues = z.infer<typeof updateSchema>;

function ConfigRow({ entry, onSave }: {
  entry: { key: string; value: string | null; description: string; isReadOnly: boolean };
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { value: entry.value ?? "" },
  });

  const handleSubmit = async (values: UpdateValues) => {
    setSaving(true);
    try {
      await onSave(entry.key, values.value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const isSmtpKey = entry.key.startsWith("smtp_");

  return (
    <div className="py-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{entry.key}</code>
            {entry.isReadOnly && (
              <Badge variant="outline" className="text-xs gap-1">
                <Lock className="h-2.5 w-2.5" />
                Read-only
              </Badge>
            )}
            {isSmtpKey && (
              <Badge variant="outline" className="text-xs">SMTP</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{entry.description}</p>
        </div>

        {!entry.isReadOnly && !editing && (
          <Button size="sm" variant="outline" onClick={() => { form.reset({ value: entry.value ?? "" }); setEditing(true); }}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex gap-2 mt-2">
            <FormField control={form.control} name="value" render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input {...field} autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        </Form>
      ) : (
        <div className="pl-0">
          <p className="text-sm font-mono">
            {entry.value ? (
              <span className="text-foreground">{entry.value}</span>
            ) : (
              <span className="text-muted-foreground italic">
                {entry.isReadOnly ? "Not set" : "Using default"}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminConfigPage() {
  const { data, isLoading } = useListConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateConfig();

  const config = data?.config ?? [];

  const smtpEntries = config.filter((c) => c.key.startsWith("smtp_") || c.key.startsWith("lodge_"));
  const sessionEntries = config.filter((c) =>
    ["session_timeout_min", "lockout_max_attempts", "lockout_duration_min"].includes(c.key)
  );
  const inviteEntries = config.filter((c) =>
    ["invite_expiry_days", "reset_expiry_hours", "require_2fa_roles"].includes(c.key)
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
            toast({ title: "Error", description: e?.data?.error ?? "Failed to update configuration", variant: "destructive" });
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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6" /> Configuration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage portal settings. Read-only fields are set during setup or via environment variables.
          </p>
        </div>

        <Alert>
          <Key className="h-4 w-4" />
          <AlertTitle>SMTP Password</AlertTitle>
          <AlertDescription>
            The SMTP password (<code className="text-xs font-mono">SMTP_PASS</code>) must be set as an <strong>environment secret</strong> and is never stored in the database.
            Email delivery will not work without it. Contact your system administrator to configure it.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="border rounded-lg px-4">
              <h2 className="text-sm font-semibold py-3 text-muted-foreground uppercase tracking-wide">Lodge &amp; Email</h2>
              <Separator />
              <div className="divide-y">
                {smtpEntries.map((entry) => (
                  <ConfigRow key={entry.key} entry={entry} onSave={handleSave} />
                ))}
              </div>
            </div>

            <div className="border rounded-lg px-4">
              <h2 className="text-sm font-semibold py-3 text-muted-foreground uppercase tracking-wide">Session &amp; Lockout</h2>
              <Separator />
              <div className="divide-y">
                {sessionEntries.map((entry) => (
                  <ConfigRow key={entry.key} entry={entry} onSave={handleSave} />
                ))}
              </div>
            </div>

            <div className="border rounded-lg px-4">
              <h2 className="text-sm font-semibold py-3 text-muted-foreground uppercase tracking-wide">Invitations &amp; Security</h2>
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
                Session timeout changes apply to new sessions only. To force existing sessions to expire, restart the API server.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
