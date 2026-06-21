import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { useResetPassword } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useState } from "react";
import { PasswordRequirements } from "@/components/password-requirements";
import { useAppPolicy, DEFAULT_PASSWORD_POLICY } from "@/lib/usePasswordPolicy";

const schema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters"),
  confirm: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);
  const resetPassword = useResetPassword();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const watchedPassword = form.watch("password");
  const { data: appPolicy } = useAppPolicy();
  const policy = appPolicy?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY;

  if (!token) {
    return (
      <AuthLayout title="Invalid Link" subtitle="This password reset link is not valid">
        <div className="text-center py-2">
          <div className="flex justify-center mb-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            The reset link is missing a required token. Please request a new password reset.
          </p>
          <Link href="/forgot-password">
            <a>
              <Button variant="outline" className="w-full" data-testid="link-request-new-reset">
                Request New Reset
              </Button>
            </a>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Password Changed" subtitle="Your password has been updated">
        <div className="text-center py-2">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Your password has been changed successfully. You may now sign in with your new password.
          </p>
          <Link href="/login">
            <a>
              <Button className="w-full" data-testid="link-go-to-login">
                Sign In
              </Button>
            </a>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = (values: Values) => {
    resetPassword.mutate(
      { data: { token: token!, password: values.password } },
      {
        onSuccess: () => setSuccess(true),
        onError: () => {
          toast({ title: "Reset failed", description: "This link may be expired or already used. Please request a new reset.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <AuthLayout title="Set New Password" subtitle="Choose a strong password for your account">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    autoFocus
                    data-testid="input-password"
                  />
                </FormControl>
                <PasswordRequirements password={watchedPassword} policy={policy} showHistoryNote />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={resetPassword.isPending}
            data-testid="button-submit"
          >
            {resetPassword.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Set Password
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
