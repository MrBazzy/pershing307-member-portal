import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForgotPassword } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link } from "wouter";
import { Loader2, CheckCircle } from "lucide-react";
import { useState } from "react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const forgotPassword = useForgotPassword();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const handleSubmit = (values: Values) => {
    forgotPassword.mutate(
      { data: { email: values.email } },
      {
        onSuccess: () => setSubmitted(true),
        onError: () => setSubmitted(true),
      }
    );
  };

  if (submitted) {
    return (
      <AuthLayout title="Check Your Email" subtitle="Password reset instructions sent">
        <div className="text-center py-2">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-12 w-12 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            If an account exists for that email address, you will receive a password reset link shortly.
          </p>
          <Button variant="outline" className="w-full" data-testid="link-back-to-login" onClick={() => window.location.href = "/login"}>
            Return to Sign In
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your email to receive a reset link">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          <FormField
            control={form.control}
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
          <Button
            type="submit"
            className="w-full"
            disabled={forgotPassword.isPending}
            data-testid="button-submit"
          >
            {forgotPassword.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send Reset Link
          </Button>
          <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-to-login-2">
            Back to Sign In
          </Link>
        </form>
      </Form>
    </AuthLayout>
  );
}
