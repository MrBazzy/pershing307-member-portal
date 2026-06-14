import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBirthdayVisibility,
  useUpdateBirthdayVisibility,
  useGetOwnDateOfBirth,
  useUpdateOwnDateOfBirth,
  getGetBirthdayVisibilityQueryKey,
  getGetOwnDateOfBirthQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Cake, Calendar, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

type Visibility = "hidden" | "day_month" | "full";

const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "hidden",
    label: "Do not show my birthday",
    description: "Your birthday will not appear in the calendar or widget.",
    Icon: EyeOff,
  },
  {
    value: "day_month",
    label: "Show my birthday with day and month only",
    description: "Others see your name and the day and month. Your birth year and age are hidden.",
    Icon: Cake,
  },
  {
    value: "full",
    label: "Show my full birthdate and age",
    description: "Others see your name, full date of birth, and your current age.",
    Icon: Calendar,
  },
];

export default function ProfileSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const maxPermissionLevel = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
  const canEdit = maxPermissionLevel >= 20;

  const { data: dobData, isLoading: isDobLoading } = useGetOwnDateOfBirth();
  const { data: visData, isLoading: isVisLoading } = useGetBirthdayVisibility();

  const updateDob = useUpdateOwnDateOfBirth();
  const updateVisibility = useUpdateBirthdayVisibility();

  const savedDob = dobData?.dateOfBirth ?? null;
  const [dobInput, setDobInput] = useState<string>(savedDob ?? "");
  useEffect(() => { setDobInput(savedDob ?? ""); }, [savedDob]);

  const savedVisibility = (visData?.visibility ?? "hidden") as Visibility;
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility>(savedVisibility);
  useEffect(() => { setSelectedVisibility(savedVisibility); }, [savedVisibility]);

  const dobChanged = dobInput !== (savedDob ?? "");
  const visibilityChanged = selectedVisibility !== savedVisibility;

  const handleSaveDob = () => {
    updateDob.mutate(
      { data: { dateOfBirth: dobInput || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOwnDateOfBirthQueryKey() });
          toast({ title: "Saved", description: "Your date of birth has been updated." });
        },
        onError: (e: any) => {
          toast({
            title: "Error",
            description: e?.data?.error ?? "Failed to save date of birth.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveVisibility = () => {
    updateVisibility.mutate(
      { data: { visibility: selectedVisibility } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetBirthdayVisibilityQueryKey() });
          toast({ title: "Saved", description: "Your birthday privacy setting has been updated." });
        },
        onError: (e: any) => {
          toast({
            title: "Error",
            description: e?.data?.error ?? "Failed to save setting.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cake className="h-6 w-6" />
            Profile Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your birthday information and how it is shared with other lodge members.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Birthday Information</CardTitle>
            <CardDescription>
              {canEdit
                ? "Set your date of birth and choose how it appears in the Birthday Calendar."
                : "Your birthday information. Contact a lodge administrator to make changes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Date of Birth */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Date of Birth</p>
              {isDobLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : canEdit ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={dobInput}
                      onChange={(e) => setDobInput(e.target.value)}
                      className="flex-1"
                      data-testid="input-own-dob"
                    />
                    <Button
                      onClick={handleSaveDob}
                      disabled={updateDob.isPending || !dobChanged}
                      data-testid="button-save-dob"
                    >
                      {updateDob.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save
                    </Button>
                    {dobChanged && (
                      <button
                        type="button"
                        onClick={() => setDobInput(savedDob ?? "")}
                        className="text-xs text-muted-foreground hover:text-foreground px-1"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {savedDob && (
                    <p className="text-xs text-muted-foreground">
                      Currently: {format(parseISO(savedDob), "MMMM d, yyyy")}
                    </p>
                  )}
                  {!savedDob && !dobInput && (
                    <p className="text-xs text-muted-foreground">No date of birth on file.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-foreground">
                  {savedDob
                    ? format(parseISO(savedDob), "MMMM d, yyyy")
                    : <span className="italic text-muted-foreground">No date of birth on file.</span>}
                </p>
              )}
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Birthday Privacy */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Birthday Privacy</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {canEdit
                    ? "Choose whether and how your birthday appears in the Birthday Calendar. Your birth year is never shown unless you choose the full option."
                    : "Your current birthday privacy setting."}
                </p>
              </div>

              {isVisLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-sm" />)}
                </div>
              ) : canEdit ? (
                <>
                  {VISIBILITY_OPTIONS.map(({ value, label, description, Icon }) => {
                    const active = selectedVisibility === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelectedVisibility(value)}
                        data-testid={`birthday-visibility-${value}`}
                        className={cn(
                          "w-full flex items-start gap-3 rounded-sm border p-4 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            active ? "border-primary bg-primary" : "border-muted-foreground/40"
                          )}
                        >
                          {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        </div>
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 mt-0.5",
                            active ? "text-primary" : "text-muted-foreground/50"
                          )}
                        />
                      </button>
                    );
                  })}

                  <div className="pt-1 flex items-center gap-3">
                    <Button
                      onClick={handleSaveVisibility}
                      disabled={updateVisibility.isPending || !visibilityChanged}
                      data-testid="button-save-visibility"
                    >
                      {updateVisibility.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Preference
                    </Button>
                    {visibilityChanged && (
                      <button
                        type="button"
                        onClick={() => setSelectedVisibility(savedVisibility)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-sm border border-border p-4 bg-muted/30">
                  {(() => {
                    const opt = VISIBILITY_OPTIONS.find((o) => o.value === savedVisibility);
                    return opt ? (
                      <div className="flex items-start gap-3">
                        <opt.Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {!canEdit && (
                <p className="text-xs text-muted-foreground italic">
                  Birthday settings can only be changed by members. Contact a lodge administrator if you need assistance.
                </p>
              )}
            </div>

          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
