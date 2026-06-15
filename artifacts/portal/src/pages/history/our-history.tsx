import { useState } from "react";
import {
  useGetHistoryPage,
  useUpdateHistoryPage,
  getGetHistoryPageQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { HistoryLayout } from "@/components/history/history-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Save, X, Landmark } from "lucide-react";
import { ADMIN_LEVEL } from "@/lib/roles";
import { format } from "date-fns";

function maxLevel(user: ReturnType<typeof useAuth>["user"]): number {
  return user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
}

export default function OurHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = maxLevel(user) >= ADMIN_LEVEL;

  const { data, isLoading } = useGetHistoryPage();
  const update = useUpdateHistoryPage();

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const page = data?.page;

  function startEdit() {
    setDraftTitle(page?.title ?? "Our History");
    setDraftContent(page?.content ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function save() {
    update.mutate(
      { data: { content: draftContent, title: draftTitle } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetHistoryPageQueryKey() });
          setEditing(false);
          toast({ title: "History page updated" });
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      }
    );
  }

  return (
    <HistoryLayout>
      {isLoading ? (
        <Card className="border-card-border">
          <CardContent className="py-8 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ) : editing ? (
        <Card className="border-card-border">
          <CardContent className="py-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Page Title
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-lg font-semibold bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Content
              </label>
              <textarea
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[360px] leading-relaxed"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                maxLength={50000}
                placeholder="Enter the lodge's history narrative here. Use blank lines to separate paragraphs."
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {draftContent.length.toLocaleString()} / 50,000
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={save}
                disabled={update.isPending || !draftContent.trim()}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Changes
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={update.isPending}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-card-border">
          <CardContent className="py-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-primary/10 shrink-0">
                  <Landmark className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">
                  {page?.title ?? "Our History"}
                </h2>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startEdit}
                  className="shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
            </div>

            {page?.content ? (
              <div className="prose prose-sm max-w-none">
                {page.content
                  .split(/\n\n+/)
                  .filter(Boolean)
                  .map((para, i) => (
                    <p
                      key={i}
                      className="text-sm text-foreground/90 leading-relaxed mb-4 last:mb-0 whitespace-pre-wrap"
                    >
                      {para}
                    </p>
                  ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Landmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No content yet. {isAdmin ? "Click Edit to add content." : "Check back later."}
                </p>
              </div>
            )}

            {page?.updatedAt && (
              <p className="text-[11px] text-muted-foreground mt-8 pt-4 border-t border-border">
                Last updated {format(new Date(page.updatedAt), "MMMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </HistoryLayout>
  );
}
