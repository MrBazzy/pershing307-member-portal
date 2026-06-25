import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useRunBootstrap, getGetBootstrapStatusQueryKey } from "@workspace/api-client-react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, ChevronRight, ChevronLeft, AlertCircle } from "lucide-react";
import { PasswordStrength } from "@/components/password-strength";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "America/Toronto", "America/Vancouver", "America/Halifax",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
  "Europe/Madrid", "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw",
  "Europe/Prague", "Europe/Vienna", "Europe/Zurich", "Europe/Brussels",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
  "Pacific/Auckland", "Asia/Tokyo", "Asia/Singapore", "Asia/Hong_Kong",
  "Asia/Seoul", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
  "Africa/Johannesburg", "Africa/Lagos", "America/Sao_Paulo", "America/Mexico_City",
];

const lodgeSchema = z.object({
  lodgeName: z.string().min(2, "Lodge name must be at least 2 characters").max(200),
  lodgeNumber: z.string().min(1, "Lodge number is required").max(50),
  timezone: z.string().min(1, "Timezone is required"),
});

const adminSchema = z.object({
  adminFirstName: z.string().min(1, "First name is required").max(100),
  adminLastName: z.string().min(1, "Last name is required").max(100),
  adminEmail: z.string().email("Enter a valid email address"),
  adminPassword: z.string().min(12, "Password must be at least 12 characters"),
  adminPasswordConfirm: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.adminPassword === d.adminPasswordConfirm, {
  message: "Passwords do not match",
  path: ["adminPasswordConfirm"],
});

const emailSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), { message: "Port must be a number" })
    .refine((v) => !v || (parseInt(v, 10) > 0 && parseInt(v, 10) <= 65535), {
      message: "Port must be between 1 and 65535",
    }),
  smtpUser: z.string().optional(),
  smtpFromEmail: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Enter a valid email address",
    }),
  smtpFromName: z.string().optional(),
});

type LodgeValues = z.infer<typeof lodgeSchema>;
type AdminValues = z.infer<typeof adminSchema>;
type EmailValues = z.infer<typeof emailSchema>;

type FullData = LodgeValues & AdminValues & EmailValues;

const STEPS = ["Lodge", "Administrator", "Email", "Review"];

const LODGE_FIELDS = new Set(["lodgeName", "lodgeNumber", "timezone"]);
const ADMIN_FIELDS = new Set(["adminEmail", "adminFirstName", "adminLastName", "adminPassword"]);
const EMAIL_FIELDS = new Set(["smtpHost", "smtpPort", "smtpUser", "smtpFromEmail", "smtpFromName"]);

export default function BootstrapPage() {
  const [step, setStep] = useState(0);
  const [lodgeData, setLodgeData] = useState<LodgeValues | null>(null);
  const [adminData, setAdminData] = useState<AdminValues | null>(null);
  const [emailData, setEmailData] = useState<EmailValues>({});
  const [success, setSuccess] = useState(false);
  const [alreadyBootstrapped, setAlreadyBootstrapped] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const runBootstrap = useRunBootstrap();
  const queryClient = useQueryClient();

  const lodgeForm = useForm<LodgeValues>({
    resolver: zodResolver(lodgeSchema),
    defaultValues: lodgeData ?? { lodgeName: "", lodgeNumber: "", timezone: "America/New_York" },
  });

  const adminForm = useForm<AdminValues>({
    resolver: zodResolver(adminSchema),
    defaultValues: adminData ?? { adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: "", adminPasswordConfirm: "" },
  });

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: emailData,
  });

  const watchedPassword = adminForm.watch("adminPassword");

  const handleLodgeSubmit = (values: LodgeValues) => {
    setLodgeData(values);
    setStep(1);
  };

  const handleAdminSubmit = (values: AdminValues) => {
    setAdminData(values);
    setStep(2);
  };

  const handleEmailSubmit = (values: EmailValues) => {
    setEmailData(values);
    setStep(3);
  };

  const handleBootstrap = () => {
    if (!lodgeData || !adminData) return;

    const payload: FullData = { ...lodgeData, ...adminData, ...emailData };

    const smtpPort = payload.smtpPort || (payload.smtpHost ? "587" : null);

    runBootstrap.mutate(
      {
        data: {
          lodgeName: payload.lodgeName,
          lodgeNumber: payload.lodgeNumber,
          timezone: payload.timezone,
          adminEmail: payload.adminEmail,
          adminFirstName: payload.adminFirstName,
          adminLastName: payload.adminLastName,
          adminPassword: payload.adminPassword,
          smtpHost: payload.smtpHost || null,
          smtpPort,
          smtpUser: payload.smtpUser || null,
          smtpFromEmail: payload.smtpFromEmail || null,
          smtpFromName: payload.smtpFromName || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBootstrapStatusQueryKey() });
          setSuccess(true);
        },
        onError: (error: any) => {
          if (error?.status === 409) {
            setAlreadyBootstrapped(true);
            return;
          }

          if (error?.status === 400 && Array.isArray(error?.data?.issues)) {
            const issues = error.data.issues as Array<{ path: string[]; message: string }>;
            for (const issue of issues) {
              const field = issue.path[0] as string | undefined;
              if (!field) continue;
              if (LODGE_FIELDS.has(field)) {
                lodgeForm.setError(field as keyof LodgeValues, { message: issue.message });
                setStep(0);
                return;
              }
              if (ADMIN_FIELDS.has(field)) {
                adminForm.setError(field as keyof AdminValues, { message: issue.message });
                setStep(1);
                return;
              }
              if (EMAIL_FIELDS.has(field)) {
                emailForm.setError(field as keyof EmailValues, { message: issue.message });
                setStep(2);
                return;
              }
            }
          }

          const description =
            (error?.data as any)?.error ??
            "An error occurred during setup. Please check the form and try again.";
          toast({ title: "Setup failed", description, variant: "destructive" });
        },
      }
    );
  };

  if (alreadyBootstrapped) {
    return (
      <AuthLayout title="Already Set Up" subtitle="This portal has already been configured">
        <div className="text-center py-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            This portal has already been set up. Please log in with your administrator credentials.
          </p>
          <Button className="w-full" onClick={() => setLocation("/login")} data-testid="button-go-to-login">
            Go to Login
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Setup Complete" subtitle="Your lodge portal is ready">
        <div className="text-center py-4">
          <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-2 font-medium">{lodgeData?.lodgeName}</p>
          <p className="text-sm text-muted-foreground mb-6">
            The portal has been configured. You can now sign in with your administrator credentials.
          </p>
          <Button className="w-full" onClick={() => setLocation("/login")} data-testid="button-go-to-login">
            Sign In
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Portal Setup" subtitle="Configure your lodge member portal">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors",
                i < step ? "bg-primary text-primary-foreground" :
                i === step ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                "bg-muted text-muted-foreground"
              )}>
                {i < step ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("h-px w-full mx-1 flex-1", i < step ? "bg-primary" : "bg-border")} style={{ minWidth: 20 }} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <span key={s} className={cn("text-[10px]", i === step ? "text-foreground font-medium" : "text-muted-foreground")}>{s}</span>
          ))}
        </div>
      </div>

      {step === 0 && (
        <Form {...lodgeForm}>
          <form onSubmit={lodgeForm.handleSubmit(handleLodgeSubmit)} className="space-y-4">
            <FormField control={lodgeForm.control} name="lodgeName" render={({ field }) => (
              <FormItem>
                <FormLabel>Lodge Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="General John J. Pershing Lodge" autoFocus data-testid="input-lodge-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={lodgeForm.control} name="lodgeNumber" render={({ field }) => (
              <FormItem>
                <FormLabel>Lodge Number</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="307" data-testid="input-lodge-number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={lodgeForm.control} name="timezone" render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60">
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" data-testid="button-next-step-1">
              Continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </form>
        </Form>
      )}

      {step === 1 && (
        <Form {...adminForm}>
          <form onSubmit={adminForm.handleSubmit(handleAdminSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={adminForm.control} name="adminFirstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus data-testid="input-admin-first-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={adminForm.control} name="adminLastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-admin-last-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={adminForm.control} name="adminEmail" render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" data-testid="input-admin-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={adminForm.control} name="adminPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="new-password" data-testid="input-admin-password" />
                </FormControl>
                <PasswordStrength password={watchedPassword} />
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={adminForm.control} name="adminPasswordConfirm" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="new-password" data-testid="input-admin-password-confirm" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button type="submit" className="flex-1" data-testid="button-next-step-2">
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </form>
        </Form>
      )}

      {step === 2 && (
        <Form {...emailForm}>
          <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-4">
            <p className="text-xs text-muted-foreground pb-1">Optional — configure SMTP to send invitation and password reset emails.</p>
            <FormField control={emailForm.control} name="smtpHost" render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Host</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="smtp.example.com" data-testid="input-smtp-host" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={emailForm.control} name="smtpPort" render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="587" data-testid="input-smtp-port" />
                  </FormControl>
                  <FormDescription className="text-[11px]">Default: 587</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={emailForm.control} name="smtpUser" render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="user@example.com" data-testid="input-smtp-user" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={emailForm.control} name="smtpFromEmail" render={({ field }) => (
              <FormItem>
                <FormLabel>From Email</FormLabel>
                <FormControl>
                  <Input {...field} type="email" placeholder="noreply@lodge307.org" data-testid="input-smtp-from-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={emailForm.control} name="smtpFromName" render={({ field }) => (
              <FormItem>
                <FormLabel>From Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Lodge 307 Portal" data-testid="input-smtp-from-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button type="submit" className="flex-1" data-testid="button-next-step-3">
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </form>
        </Form>
      )}

      {step === 3 && lodgeData && adminData && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Lodge</p>
              <div className="bg-muted/50 rounded-sm border border-border p-3 space-y-1.5">
                <ReviewRow label="Name" value={lodgeData.lodgeName} />
                <ReviewRow label="Number" value={lodgeData.lodgeNumber} />
                <ReviewRow label="Timezone" value={lodgeData.timezone.replace(/_/g, " ")} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Administrator</p>
              <div className="bg-muted/50 rounded-sm border border-border p-3 space-y-1.5">
                <ReviewRow label="Name" value={`${adminData.adminFirstName} ${adminData.adminLastName}`} />
                <ReviewRow label="Email" value={adminData.adminEmail} />
              </div>
            </div>
            {emailData.smtpHost && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Email</p>
                <div className="bg-muted/50 rounded-sm border border-border p-3 space-y-1.5">
                  <ReviewRow label="Host" value={emailData.smtpHost} />
                  <ReviewRow label="Port" value={emailData.smtpPort || "587 (default)"} />
                  {emailData.smtpFromEmail && <ReviewRow label="From" value={emailData.smtpFromEmail} />}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleBootstrap}
              disabled={runBootstrap.isPending}
              data-testid="button-complete-setup"
            >
              {runBootstrap.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Complete Setup
            </Button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-foreground text-right truncate">{value}</span>
    </div>
  );
}
