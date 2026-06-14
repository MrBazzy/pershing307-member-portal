import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, User, Shield, ChevronRight, Loader2, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { PasswordStrength } from "@/components/password-strength";

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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  /**
   * One-way latch: once hasTemporaryPassword is seen as true it stays true
   * for this component's lifetime, even after the password is changed and the
   * server clears the flag.  Prevents a mid-flight re-render from switching
   * away from the forced-reset UI before navigation completes.
   */
  const forcedResetLatched = useRef(false);
  const [forcedReset, setForcedReset] = useState(false);

  useEffect(() => {
    if (user?.hasTemporaryPassword && !forcedResetLatched.current) {
      forcedResetLatched.current = true;
      setForcedReset(true);
    }
  }, [user?.hasTemporaryPassword]);

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

  // --- Forced-reset: always navigates to /dashboard on success ---
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
      await refetch();
      setLocation("/dashboard");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
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
                        <div className="relative">
                          <Input type={showCurrent ? "text" : "password"} {...field} autoComplete="current-password" />
                          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={forcedPasswordForm.control} name="newPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type={showNew ? "text" : "password"} {...field} autoComplete="new-password" />
                          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <PasswordStrength password={forcedNewPassword} />
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={forcedPasswordForm.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl><Input type="password" {...field} autoComplete="new-password" /></FormControl>
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
          <h1 className="text-2xl font-bold text-foreground">Welcome to Pershing No. 307</h1>
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
