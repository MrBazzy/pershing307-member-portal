import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useGetTwoFactorStatus, useEnrollTwoFactor, useVerifyTwoFactorEnroll, useDisableTwoFactor, getGetTwoFactorStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, ShieldOff, Smartphone, Copy, AlertTriangle, Loader2, RefreshCw, CheckCircle } from "lucide-react";

const verifySchema = z.object({ code: z.string().min(6).max(8) });
const disableSchema = z.object({ code: z.string().min(6).max(8) });

type VerifyValues = z.infer<typeof verifySchema>;
type DisableValues = z.infer<typeof disableSchema>;

export default function TwoFactorPage() {
  const { data: statusData, isLoading } = useGetTwoFactorStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [enrollData, setEnrollData] = useState<{ qrCodeUri: string; backupCodes: string[] } | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [codesRevealed, setCodesRevealed] = useState(false);

  const enrollMutation = useEnrollTwoFactor();
  const verifyMutation = useVerifyTwoFactorEnroll();
  const disableMutation = useDisableTwoFactor();

  const verifyForm = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: "" },
  });

  const disableForm = useForm<DisableValues>({
    resolver: zodResolver(disableSchema),
    defaultValues: { code: "" },
  });

  const tf = statusData;
  const enabled = tf?.enabled ?? false;
  const hasPending = tf?.hasPendingEnrollment ?? false;

  const handleStartEnroll = () => {
    enrollMutation.mutate(undefined, {
      onSuccess: (data) => {
        setEnrollData({ qrCodeUri: data.qrCodeUri, backupCodes: data.backupCodes });
        verifyForm.reset();
        setCodesRevealed(false);
      },
      onError: (e: any) => {
        toast({ title: "Error", description: e?.data?.error ?? "Failed to start enrollment", variant: "destructive" });
      },
    });
  };

  const handleVerifyEnroll = (values: VerifyValues) => {
    verifyMutation.mutate(
      { data: { code: values.code } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTwoFactorStatusQueryKey() });
          setEnrollData(null);
          toast({ title: "2FA enabled", description: "Your authenticator app is now active." });
        },
        onError: (e: any) => {
          toast({ title: "Verification failed", description: e?.data?.error ?? "Invalid code", variant: "destructive" });
        },
      }
    );
  };

  const handleDisable = (values: DisableValues) => {
    disableMutation.mutate(
      { data: { code: values.code } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTwoFactorStatusQueryKey() });
          setShowDisable(false);
          disableForm.reset();
          toast({ title: "2FA disabled", description: "Two-factor authentication has been removed from your account." });
        },
        onError: (e: any) => {
          toast({ title: "Error", description: e?.data?.error ?? "Invalid code", variant: "destructive" });
        },
      }
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied", description: "Backup code copied to clipboard." });
  };

  const copyAllCodes = () => {
    if (!enrollData) return;
    navigator.clipboard.writeText(enrollData.backupCodes.join("\n"));
    toast({ title: "Copied", description: "All backup codes copied to clipboard." });
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6" /> Two-Factor Authentication
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Protect your account with a TOTP authenticator app (e.g., Google Authenticator, Authy, 1Password).
          </p>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
        ) : enabled ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  2FA is Active
                </CardTitle>
                <Badge className="bg-green-100 text-green-800 border-green-200 border">Enabled</Badge>
              </div>
              <CardDescription>
                Your account is protected. You will be required to enter a TOTP code on each login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tf?.enrolledAt && (
                <p className="text-xs text-muted-foreground">
                  Enrolled on {new Date(tf.enrolledAt).toLocaleDateString()}
                </p>
              )}
              <Separator />
              {!showDisable ? (
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setShowDisable(true)}>
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Disable 2FA
                </Button>
              ) : (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Confirm Disable</AlertTitle>
                    <AlertDescription>
                      Enter your current TOTP code to disable two-factor authentication.
                    </AlertDescription>
                  </Alert>
                  <Form {...disableForm}>
                    <form onSubmit={disableForm.handleSubmit(handleDisable)} className="flex gap-2">
                      <FormField control={disableForm.control} name="code" render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="6-digit code" maxLength={8} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" variant="destructive" disabled={disableMutation.isPending}>
                        {disableMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => { setShowDisable(false); disableForm.reset(); }}>
                        Cancel
                      </Button>
                    </form>
                  </Form>
                </div>
              )}
            </CardContent>
          </Card>
        ) : !enrollData ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Set Up Authenticator App
              </CardTitle>
              <CardDescription>
                Scan a QR code with your authenticator app to generate one-time codes for login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <strong>Required for your role.</strong> Site Administrators and PM Super Administrators must have 2FA enabled.
              </div>
              <Button onClick={handleStartEnroll} disabled={enrollMutation.isPending}>
                {enrollMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
                Begin Setup
              </Button>
              {hasPending && (
                <Button variant="outline" size="sm" onClick={handleStartEnroll} disabled={enrollMutation.isPending}>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Restart enrollment
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 1 — Scan QR Code</CardTitle>
                <CardDescription>
                  Open your authenticator app and scan the QR code below. Then click Continue.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="border rounded-lg p-3 bg-white">
                  <img src={enrollData.qrCodeUri} alt="2FA QR Code" className="w-52 h-52" />
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Can't scan? Enter the secret manually in your app.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 2 — Save Backup Codes</CardTitle>
                <CardDescription>
                  Store these codes somewhere safe. Each can be used once to log in if you lose your authenticator device.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!codesRevealed ? (
                  <Button variant="outline" onClick={() => setCodesRevealed(true)}>
                    Reveal Backup Codes
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {enrollData.backupCodes.map((code) => (
                        <div key={code} className="flex items-center justify-between bg-muted px-3 py-2 rounded font-mono text-sm">
                          <span>{code}</span>
                          <button onClick={() => copyCode(code)} className="text-muted-foreground hover:text-foreground ml-2">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={copyAllCodes}>
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Copy All Codes
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 3 — Verify</CardTitle>
                <CardDescription>
                  Enter the 6-digit code from your authenticator app to confirm the setup.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...verifyForm}>
                  <form onSubmit={verifyForm.handleSubmit(handleVerifyEnroll)} className="flex gap-2">
                    <FormField control={verifyForm.control} name="code" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input placeholder="000000" maxLength={8} className="font-mono text-lg tracking-widest text-center" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" disabled={verifyMutation.isPending}>
                      {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <><CheckCircle className="h-4 w-4 mr-2" />Verify</>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEnrollData(null)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
