import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, useVerifyTwoFactor, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Loader2, Shield } from "lucide-react";

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
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

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
            setRequiresTwoFactor(true);
          } else {
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            setLocation("/dashboard");
          }
        },
        onError: (err: any) => {
          const status = err?.status;
          if (status === 423) {
            toast({ title: "Account locked", description: "Your account is temporarily locked. Please try again later.", variant: "destructive" });
          } else {
            toast({ title: "Invalid credentials", description: "The email or password you entered is incorrect.", variant: "destructive" });
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
        onError: () => {
          toast({ title: "Invalid code", description: "The authentication code is incorrect or expired.", variant: "destructive" });
        },
      }
    );
  };

  if (requiresTwoFactor) {
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
              onClick={() => setRequiresTwoFactor(false)}
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
                  <Input
                    {...field}
                    type="password"
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
