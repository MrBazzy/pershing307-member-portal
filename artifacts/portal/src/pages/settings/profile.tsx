import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBirthdayVisibility,
  useUpdateBirthdayVisibility,
  getGetBirthdayVisibilityQueryKey,
} from "@workspace/api-client-react";
import { Cake, Calendar, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Visibility = "hidden" | "day_month" | "full";

const OPTIONS: { value: Visibility; label: string; description: string; Icon: React.ComponentType<{ className?: string }> }[] = [
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
  const { data, isLoading } = useGetBirthdayVisibility();
  const mutation = useUpdateBirthdayVisibility();

  const saved = (data?.visibility ?? "hidden") as Visibility;
  const [selected, setSelected] = useState<Visibility>(saved);

  useEffect(() => {
    setSelected(saved);
  }, [saved]);

  const handleSave = () => {
    mutation.mutate(
      { data: { visibility: selected } },
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
            Manage how your information is shared with other lodge members.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Birthday Privacy</CardTitle>
            <CardDescription>
              Choose whether and how your birthday appears in the Birthday Calendar.
              Your date of birth is never shared — only the details you choose below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-sm" />)}
              </div>
            ) : (
              <>
                {OPTIONS.map(({ value, label, description, Icon }) => {
                  const active = selected === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelected(value)}
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

                <div className="pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={mutation.isPending || selected === saved}
                    data-testid="button-save-visibility"
                  >
                    {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Preference
                  </Button>
                  {selected !== saved && (
                    <button
                      type="button"
                      onClick={() => setSelected(saved)}
                      className="ml-3 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
