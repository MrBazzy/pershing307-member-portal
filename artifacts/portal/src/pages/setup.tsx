import { useState, useEffect, useRef } from "react";
import { useGetBootstrapStatus } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, User, Shield, ChevronRight, Loader2, KeyRound, Lock } from "lucide-react";
import { PasswordRequirements } from "@/components/password-requirements";
import { useAppPolicy, DEFAULT_PASSWORD_POLICY } from "@/lib/usePasswordPolicy";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  displayName: z.string().max(100).optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(12, "Minimum 12 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[a-z]/, "Must contain a lowercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

const SETUP_STEPS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "privacy", label: "Privacy", icon: Shield },
];

export default function SetupPage() {
  const { user, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { data: bootstrapStatus } = useGetBootstrapStatus();


  /**
   * One-way latch: fires only when BOTH mustChangePassword AND
   * hasTemporaryPassword are true simultaneously (admin-forced reset).
   * Requiring mustChangePassword means a background refetch returning a stale
   * hasTemporaryPassword:true can never re-arm this latch once the password
   * change has been committed (server sets mustChangePassword:false immediately).
   */
  const forcedResetLatched = useRef(false);
  const [forcedReset, setForcedReset] = useState(false);

  useEffect(() => {
    if (user?.mustChangePassword && user?.hasTemporaryPassword && !forcedResetLatched.current) {
      forcedResetLatched.current = true;
      setForcedReset(true);
    }
  }, [user?.mustChangePassword, user?.hasTemporaryPassword]);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      displayName: user?.displayName ?? "",
    },
  });

  const forcedPasswordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const forcedNewPassword = forcedPasswordForm.watch("newPassword");
  const { data: appPolicy } = useAppPolicy();
  const policy = appPolicy?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY;

  // --- Forced-reset: full page reload on success ---
  // window.location.replace is used deliberately instead of setLocation or
  // queryClient manipulation:
  //
  // Problem: after the password change, if the user also has profileSetupRequired=true,
  // ProtectedRoute redirects back to /setup. SetupPage remounts fresh (latch=false).
  // A background /me refetch that was in-flight from the 30s poll interval can complete
  // BEFORE the new SetupPage's useEffect fires, overwriting hasTemporaryPassword back
  // to true in the TanStack Query cache. The newly-mounted useEffect then sees
  // hasTemporaryPassword=true, re-arms the latch, and shows the forced-reset UI again.
  //
  // window.location.replace destroys all React and TanStack Query state entirely.
  // The fresh page load fetches /me once from the server (mustChangePassword=false,
  // hasTemporaryPassword=false guaranteed since the DB was updated before the 200 response).
  // There are no race conditions or stale cache entries possible.
  const handleForcedResetPassword = async (values: PasswordValues) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      // Full page reload to /dashboard. ProtectedRoute will redirect to /setup for the
      // profile wizard if profileSetupRequired=true — that is correct and expected.
      // The forced-reset UI will NOT appear because:
      //   1. hasTemporaryPassword=false from the fresh server /me response
      //   2. The hardened latch also requires mustChangePassword=true (now false)
      window.location.replace(`${BASE_URL}/dashboard`);
      // setSaving(false) intentionally omitted on success: the page is navigating away.
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setSaving(false);
    }
  };

  // --- Profile step (invitation setup wizard) ---
  const handleProfileSubmit = async (values: ProfileValues) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      await refetch();
      setStep(1);
    } catch {
      toast({ title: "Error", description: "Could not save profile changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // --- Privacy/finish step: navigate to dashboard ---
  const handleFinish = async () => {
    setSaving(true);
    try {
      await refetch();
    } finally {
      setSaving(false);
    }
    setLocation("/dashboard");
  };

  // ── Forced-reset UI ──────────────────────────────────────────────────────
  if (forcedReset) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-sm bg-amber-100 dark:bg-amber-900/30 mx-auto mb-3">
              <KeyRound className="h-6 w-6 text-amber-700 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Password Reset Required</h1>
            <p className="text-sm text-muted-foreground">
              An administrator has reset your password. You must set a new password before accessing the portal.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5" /> Set a New Password
              </CardTitle>
              <CardDescription>
                Enter the temporary password you received, then choose a new permanent password.
                Temporary passwords expire after 24 hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...forcedPasswordForm}>
                <form onSubmit={forcedPasswordForm.handleSubmit(handleForcedResetPassword)} className="space-y-4">
                  <FormField control={forcedPasswordForm.control} name="currentPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temporary Password</FormLabel>
                      <FormControl>
                        <PasswordInput {...field} autoComplete="current-password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={forcedPasswordForm.control} name="newPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <PasswordInput {...field} autoComplete="new-password" />
                      </FormControl>
                      <PasswordRequirements password={forcedNewPassword} policy={policy} showHistoryNote />
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={forcedPasswordForm.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl><PasswordInput {...field} autoComplete="new-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Set New Password
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Invitation setup wizard (Profile → Privacy, no password step) ────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-sm bg-primary mx-auto mb-3">
            <span className="text-primary-foreground font-serif font-bold text-lg">G</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to {(bootstrapStatus as any)?.lodgeName ?? "the Member Portal"}</h1>
          <p className="text-sm text-muted-foreground">Let's get your account set up.</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {SETUP_STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                i < step ? "bg-green-100 text-green-700" :
                i === step ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle className="h-3 w-3" /> : <s.icon className="h-3 w-3" />}
                {s.label}
              </div>
              {i < SETUP_STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" /> Your Profile
              </CardTitle>
              <CardDescription>
                Confirm your name as it will appear in the portal. You can add a display name such as an office title or nickname.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={profileForm.control} name="firstName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={profileForm.control} name="lastName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={profileForm.control} name="displayName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl><Input placeholder="e.g., WM Smith, Bro. Johnson" {...field} /></FormControl>
                      <FormDescription>Shown in place of your full name in certain views.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save & Continue
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" /> Privacy Settings
              </CardTitle>
              <CardDescription>
                Additional privacy and notification settings will be available in your profile once the full member module is released.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Directory Listing</p>
                    <p className="text-xs text-muted-foreground">Appear in the member directory</p>
                  </div>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Email Notifications</p>
                    <p className="text-xs text-muted-foreground">Receive lodge announcements by email</p>
                  </div>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                    <p className="text-xs text-muted-foreground">Protect your account with an authenticator app</p>
                  </div>
                  <Badge variant="outline">Available in Settings</Badge>
                </div>
              </div>
              <Button className="w-full" onClick={handleFinish} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Finish Setup
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
