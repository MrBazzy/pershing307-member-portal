import { useGetHistoryPage } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark } from "lucide-react";
import { format } from "date-fns";

function prepareContent(content: string): string {
  if (!content.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return content
    .split(/\n\n+/)
    .filter(Boolean)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export default function OurHistoryPage() {
  const { data, isLoading } = useGetHistoryPage();
  const page = data?.page;

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
      ) : (
        <Card className="border-card-border">
          <CardContent className="py-6">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-primary/10 shrink-0">
                  <Landmark className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-xl font-serif font-semibold text-primary">
                  {page?.title ?? "Our History"}
                </h2>
              </div>
              <div className="h-px bg-sidebar-active/40" />
            </div>

            {page?.content ? (
              <div
                className="prose prose-sm max-w-none text-foreground/90 [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: prepareContent(page.content) }}
              />
            ) : (
              <div className="text-center py-12">
                <Landmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Check back later.</p>
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
