import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSearch, useLocation } from "wouter";
import { useGetInvitationByToken, useAcceptInvitation, getGetInvitationByTokenQueryKey } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Loader2, CheckCircle, AlertCircle, UserPlus } from "lucide-react";
import { useState } from "react";
import { PasswordStrength } from "@/components/password-strength";
import { Skeleton } from "@/components/ui/skeleton";

const schema = z.object({
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirm: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.password === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

function extractApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }
  return fallback;
}

type Values = z.infer<typeof schema>;

export default function AcceptInvitationPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  const { data, isLoading, isError, error: lookupError } = useGetInvitationByToken(token, {
    query: {
      enabled: !!token,
      queryKey: getGetInvitationByTokenQueryKey(token),
      retry: false,
    },
  });

  const acceptInvitation = useAcceptInvitation();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const watchedPassword = form.watch("password");

  if (!token) {
    return (
      <AuthLayout title="Invalid Invitation" subtitle="This invitation link is not valid">
        <div className="text-center py-2">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-6">
            The invitation link is missing a required token. Please use the link from your invitation email.
          </p>
          <Link href="/login">
            <a><Button variant="outline" className="w-full">Return to Sign In</Button></a>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isLoading) {
    return (
      <AuthLayout title="Accepting Invitation" subtitle="Please wait while we verify your invitation">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      </AuthLayout>
    );
  }

  if (isError || !data?.invitation) {
    const lookupMessage = extractApiErrorMessage(
      lookupError,
      "This invitation link may have expired or already been used. Please contact your lodge administrator."
    );
    return (
      <AuthLayout title="Invitation Not Found" subtitle="This invitation cannot be used">
        <div className="text-center py-2">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-6">
            {lookupMessage}
          </p>
          <Link href="/login">
            <a><Button variant="outline" className="w-full">Return to Sign In</Button></a>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Account Created" subtitle="Welcome to the member portal">
        <div className="text-center py-2">
          <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-6">
            Your account has been created successfully. You may now sign in.
          </p>
          <Link href="/login">
            <a><Button className="w-full" data-testid="link-go-to-login">Sign In</Button></a>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const { invitation } = data;

  const handleSubmit = (values: Values) => {
    acceptInvitation.mutate(
      { data: { token, password: values.password } },
      {
        onSuccess: () => setSuccess(true),
        onError: (error) => {
          const message = extractApiErrorMessage(
            error,
            "We couldn't create your account. Please try again or contact your lodge administrator."
          );
          toast({ title: "Registration failed", description: message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <AuthLayout
      title="Create Your Account"
      subtitle={`You have been invited to join ${invitation.lodgeName}`}
    >
      <div className="mb-6 p-4 bg-muted/50 rounded-sm border border-border">
        <div className="flex items-start gap-3">
          <UserPlus className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {invitation.firstName} {invitation.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{invitation.email}</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Choose a Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    autoComplete="new-password"
                    autoFocus
                    data-testid="input-password"
                  />
                </FormControl>
                <PasswordStrength password={watchedPassword} />
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
            disabled={acceptInvitation.isPending}
            data-testid="button-create-account"
          >
            {acceptInvitation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Account
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
