import { useState, useEffect } from "react";
import {
  useGetPershingBio,
  useUpdatePershingBio,
  getGetPershingBioQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminHistoryLayout } from "@/components/history/admin-history-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2 } from "lucide-react";

export default function AdminHistoryPershingPage() {
  const { data, isLoading } = useGetPershingBio();
  const updateBio = useUpdatePershingBio();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [biographyText, setBiographyText] = useState("");
  const [lodgeConnectionText, setLodgeConnectionText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.bio) {
      setBiographyText(data.bio.biographyText);
      setLodgeConnectionText(data.bio.lodgeConnectionText);
      setDirty(false);
    }
  }, [data?.bio]);

  const handleSave = () => {
    updateBio.mutate(
      { data: { biographyText, lodgeConnectionText } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPershingBioQueryKey() });
          setDirty(false);
          toast({ title: "Biography saved", description: "Changes are now live." });
        },
        onError: () => {
          toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <AdminHistoryLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">General John J. Pershing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edit the biography and lodge connection text displayed on the public Pershing page.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={updateBio.isPending || !dirty}
            size="sm"
            className="gap-1.5"
          >
            {updateBio.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Save className="h-3.5 w-3.5" />
            }
            Save Changes
          </Button>
        </div>

        <div className="h-px bg-sidebar-active/30" />

        {isLoading ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-48 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Biography */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Biography
              </label>
              <p className="text-xs text-muted-foreground">
                A summary of General Pershing's life and military career. Separate paragraphs with a blank line.
              </p>
              <textarea
                className="w-full min-h-[260px] rounded-sm border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-[inherit] leading-relaxed"
                value={biographyText}
                onChange={(e) => { setBiographyText(e.target.value); setDirty(true); }}
                placeholder="Enter the biography text…"
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {biographyText.length.toLocaleString()} / 20,000 characters
              </p>
            </div>

            {/* Lodge Connection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Why the Lodge Bears His Name
              </label>
              <p className="text-xs text-muted-foreground">
                Explain the connection between General Pershing and the Lodge's heritage.
              </p>
              <textarea
                className="w-full min-h-[180px] rounded-sm border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y font-[inherit] leading-relaxed"
                value={lodgeConnectionText}
                onChange={(e) => { setLodgeConnectionText(e.target.value); setDirty(true); }}
                placeholder="Enter the lodge connection text…"
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {lodgeConnectionText.length.toLocaleString()} / 10,000 characters
              </p>
            </div>

            {dirty && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                You have unsaved changes. Click "Save Changes" to publish them.
              </p>
            )}
          </div>
        )}
      </div>
    </AdminHistoryLayout>
  );
}
