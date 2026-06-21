import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  useListMyPasskeys,
  getListMyPasskeysQueryKey,
  beginPasskeyRegistration,
  completePasskeyRegistration,
  deletePasskey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Trash2, Loader2, Plus, ShieldCheck, Info, ShieldOff } from "lucide-react";
import { useAppPolicy } from "@/lib/usePasswordPolicy";
import { formatDistanceToNow } from "date-fns";

function transportLabel(transports: string[] | null | undefined): string {
  if (!transports || transports.length === 0) return "";
  const map: Record<string, string> = {
    internal: "Built-in",
    hybrid: "Phone",
    usb: "USB key",
    nfc: "NFC",
    ble: "Bluetooth",
  };
  return transports.map((t) => map[t] ?? t).join(", ");
}

export default function PasskeysPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: appPolicy } = useAppPolicy();
  const passkeysEnabled = appPolicy?.passkeysEnabled ?? false;

  const { data, isLoading } = useListMyPasskeys();

  if (!passkeysEnabled) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0 mt-0.5">
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Passkeys</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Passkey authentication is not currently enabled on this portal.
              </p>
            </div>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Passkeys are disabled pending migration to stable TDA and PRD domains. A site administrator can enable them
              under <strong>Management → Configuration → Authentication</strong>.
            </AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }
  const passkeys = data?.passkeys ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListMyPasskeysQueryKey() });

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const options = await beginPasskeyRegistration();
      let credential;
      try {
        credential = await startRegistration({ optionsJSON: options as any });
      } catch (e: any) {
        if (e?.name === "NotAllowedError") {
          toast({ title: "Cancelled", description: "Passkey registration was cancelled.", variant: "destructive" });
          return;
        }
        throw e;
      }
      await completePasskeyRegistration({ body: { ...credential, label: label.trim() || "Passkey" } });
      toast({ title: "Passkey registered", description: `"${label.trim() || "Passkey"}" is ready to use.` });
      setLabel("");
      invalidate();
    } catch (e: any) {
      toast({
        title: "Registration failed",
        description: e?.data?.error ?? e?.message ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string, passkeyLabel: string) => {
    setDeletingId(id);
    try {
      await deletePasskey(id);
      toast({ title: "Passkey removed", description: `"${passkeyLabel}" has been removed.` });
      invalidate();
    } catch (e: any) {
      toast({
        title: "Failed to remove passkey",
        description: e?.data?.error ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0 mt-0.5">
            <Fingerprint className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Passkeys</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Use Face ID, Touch ID, Windows Hello, or your device PIN to sign in without a password.
              Your biometrics stay on your device — only a public key is stored here.
            </p>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Passkeys require HTTPS and a supported device. If your browser shows an error,
            ensure you are accessing the portal over a secure connection.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Passkeys</CardTitle>
            <CardDescription>
              {passkeys.length === 0
                ? "No passkeys registered yet."
                : `${passkeys.length} passkey${passkeys.length !== 1 ? "s" : ""} registered.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading passkeys…
              </div>
            )}

            {!isLoading && passkeys.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Register your first passkey below to enable biometric sign-in.
              </p>
            )}

            {passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pk.label}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        Added {formatDistanceToNow(new Date(pk.createdAt), { addSuffix: true })}
                      </span>
                      {pk.lastUsedAt && (
                        <span className="text-[11px] text-muted-foreground">
                          · Last used {formatDistanceToNow(new Date(pk.lastUsedAt), { addSuffix: true })}
                        </span>
                      )}
                      {transportLabel(pk.transports) && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {transportLabel(pk.transports)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === pk.id}
                  onClick={() => handleDelete(pk.id, pk.label)}
                  aria-label={`Remove passkey: ${pk.label}`}
                >
                  {deletingId === pk.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            ))}

            {passkeys.length > 0 && <Separator />}

            <div>
              <p className="text-sm font-medium mb-2">Register a new passkey</p>
              <div className="flex gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder="Name this passkey (e.g. MacBook Touch ID)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }}
                  disabled={registering}
                />
                <Button
                  className="h-9 shrink-0"
                  disabled={registering}
                  onClick={handleRegister}
                  data-testid="button-add-passkey"
                >
                  {registering
                    ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    : <Plus className="h-4 w-4 mr-1.5" />}
                  Add Passkey
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Your device will prompt you to authenticate to confirm registration.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
