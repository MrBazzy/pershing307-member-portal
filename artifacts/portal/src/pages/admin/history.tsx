import { useEffect, useState } from "react";
import {
  useGetHistoryPage,
  useUpdateHistoryPage,
  getGetHistoryPageQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminHistoryLayout } from "@/components/history/admin-history-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import { RichTextEditor } from "@/components/history/rich-text-editor";
import { format } from "date-fns";

export default function AdminHistoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetHistoryPage();
  const update = useUpdateHistoryPage();

  const [editorKey, setEditorKey] = useState(0);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [initialized, setInitialized] = useState(false);

  const page = data?.page;

  useEffect(() => {
    if (page && !initialized) {
      setDraftTitle(page.title ?? "Our History");
      setDraftContent(page.content ?? "");
      setEditorKey((k) => k + 1);
      setInitialized(true);
    }
  }, [page, initialized]);

  function handleSave() {
    update.mutate(
      { data: { content: draftContent, title: draftTitle } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetHistoryPageQueryKey() });
          toast({ title: "History page saved" });
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      }
    );
  }

  return (
    <AdminHistoryLayout>
      {isLoading ? (
        <Card className="border-card-border">
          <CardContent className="py-8 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-card-border">
          <CardContent className="py-6 space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Page Title
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-lg font-semibold bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={200}
                placeholder="Page title…"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Content
              </label>
              <RichTextEditor
                key={editorKey}
                defaultContent={draftContent}
                onChange={setDraftContent}
                placeholder="Enter the lodge's history narrative here…"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={update.isPending || !draftTitle.trim()}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {update.isPending ? "Saving…" : "Save Changes"}
              </Button>
              {page?.updatedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Last saved {format(new Date(page.updatedAt), "MMM d, yyyy 'at' HH:mm")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </AdminHistoryLayout>
  );
}
