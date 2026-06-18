import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, useVerifyTwoFactor, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Loader2, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const twoFactorSchema = z.object({
  code: z.string().min(6, "Enter your 6-digit code").max(8),
});

type LoginValues = z.infer<typeof loginSchema>;
type TwoFactorValues = z.infer<typeof twoFactorSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { pendingTwoFactor, pendingTwoFactorExpired } = useAuth();

  // Local state tracks 2FA step when the user just submitted their password in
  // this browser session (normal desktop flow).  On page reload, this resets to
  // false — but pendingTwoFactor from the server takes over in that case.
  const [localTwoFactor, setLocalTwoFactor] = useState(false);

  // Derive the effective 2FA step: server-side session OR local state
  const showTwoFactor = (pendingTwoFactor && !pendingTwoFactorExpired) || localTwoFactor;

  // Check for forced-logout notice on mount (stored by the global API error handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [accessNotice, setAccessNotice] = useState<string | null>(null);
  useEffect(() => {
    const stored = sessionStorage.getItem("loginNotice");
    if (stored === "force_logout") {
      setAccessNotice("Your access rights have changed. Please log in again.");
      sessionStorage.removeItem("loginNotice");
    }
  }, []);

  const login = useLogin();
  const verifyTwoFactor = useVerifyTwoFactor();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const twoFactorForm = useForm<TwoFactorValues>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: "" },
  });

  const handleLogin = (values: LoginValues) => {
    login.mutate(
      { data: { email: values.email, password: values.password } },
      {
        onSuccess: (result) => {
          if (result.requiresTwoFactor) {
            setLocalTwoFactor(true);
            // Refresh /me so the server-side pendingTwoFactor state is loaded
            // immediately — this seeds the query cache so page reloads on mobile
            // pick up the pending state from the server rather than local state.
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          } else {
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            setLocation("/dashboard");
          }
        },
        onError: (err: any) => {
          const status = err?.status;
          const reason: string = err?.data?.reason ?? "";
          const message: string = err?.data?.error ?? "";
          if (status === 403 && reason === "suspended") {
            toast({ title: "Account suspended", description: "Your account is suspended. Please contact a lodge administrator.", variant: "destructive" });
          } else if (status === 403) {
            toast({ title: "Account inactive", description: "Your account is inactive. Please contact a lodge administrator.", variant: "destructive" });
          } else if (status === 423) {
            toast({ title: "Account locked", description: "Your account is temporarily locked. Please try again later or contact a lodge administrator.", variant: "destructive" });
          } else {
            toast({ title: "Sign-in failed", description: message || "Invalid username or password.", variant: "destructive" });
          }
        },
      }
    );
  };

  const handleTwoFactor = (values: TwoFactorValues) => {
    verifyTwoFactor.mutate(
      { data: { code: values.code } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          setLocation("/dashboard");
        },
        onError: (err: any) => {
          const status = err?.status;
          if (status === 423) {
            toast({ title: "Verification locked", description: "Too many failed attempts. Two-factor verification is temporarily locked.", variant: "destructive" });
          } else {
            toast({ title: "Invalid code", description: "Invalid authentication code.", variant: "destructive" });
          }
        },
      }
    );
  };

  const handleBackToLogin = () => {
    setLocalTwoFactor(false);
    // Invalidate /me so that if the server still has a pending session the UI
    // stays consistent; the server will clear it naturally after 5 minutes.
    queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
  };

  // 2FA session expired (returned from server after 5-minute window lapses)
  if (pendingTwoFactorExpired) {
    return (
      <AuthLayout
        title="Sign In"
        subtitle="Access the member portal"
      >
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          Your 2FA session expired. Please sign in again.
        </div>
        <Form {...loginForm}>
          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
            <FormField
              control={loginForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="member@lodge307.org"
                      autoComplete="email"
                      autoFocus
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={loginForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      autoComplete="current-password"
                      data-testid="input-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending}
              data-testid="button-login"
            >
              {login.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>
      </AuthLayout>
    );
  }

  if (showTwoFactor) {
    return (
      <AuthLayout
        title="Two-Factor Authentication"
        subtitle="Enter the code from your authenticator app"
      >
        <div className="flex justify-center mb-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
        </div>
        <Form {...twoFactorForm}>
          <form onSubmit={twoFactorForm.handleSubmit(handleTwoFactor)} className="space-y-5">
            <FormField
              control={twoFactorForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Authentication Code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="000000"
                      maxLength={8}
                      className="text-center text-lg tracking-widest font-mono"
                      autoFocus
                      autoComplete="one-time-code"
                      data-testid="input-2fa-code"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={verifyTwoFactor.isPending}
              data-testid="button-verify-2fa"
            >
              {verifyTwoFactor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm"
              onClick={handleBackToLogin}
            >
              Back to login
            </Button>
          </form>
        </Form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign In"
      subtitle="Access the member portal"
    >
      {accessNotice && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          {accessNotice}
        </div>
      )}
      <Form {...loginForm}>
        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
          <FormField
            control={loginForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    placeholder="member@lodge307.org"
                    autoComplete="email"
                    autoFocus
                    data-testid="input-email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={loginForm.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline" data-testid="link-forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="current-password"
                    data-testid="input-password"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending}
            data-testid="button-login"
          >
            {login.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Sign In
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
