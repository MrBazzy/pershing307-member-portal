import { useGetHistoryPage } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
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
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
          <div className="px-8 py-10 border-b border-border text-center space-y-3">
            <Skeleton className="h-4 w-24 mx-auto" />
            <Skeleton className="h-6 w-72 mx-auto" />
            <Skeleton className="h-4 w-56 mx-auto" />
          </div>
          <div className="px-6 py-8 max-w-[850px] mx-auto space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">

          {/* Hero */}
          <div className="px-8 py-10 text-center border-b border-border bg-primary/[0.015]">
            <div className="inline-flex items-center gap-3 mb-5">
              <span className="h-px w-8 bg-sidebar-active/50" />
              <span className="text-[11px] font-semibold tracking-widest text-sidebar-active uppercase">
                1959 – Present
              </span>
              <span className="h-px w-8 bg-sidebar-active/50" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-primary mb-2 leading-snug">
              General John J. Pershing Lodge No. 307
            </h2>
            <p className="text-sm text-muted-foreground">
              A Heritage of Military Service, Brotherhood and Freemasonry
            </p>
          </div>

          {/* Article */}
          <div className="px-6 py-8">
            <div className="max-w-[850px] mx-auto space-y-6">

              {/* Section header */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-bold text-sidebar-active bg-sidebar-active/10 border border-sidebar-active/30 px-2.5 py-1 rounded-sm tracking-wider">
                    1959
                  </span>
                  <h2 className="text-xl font-serif font-semibold text-primary">
                    {page?.title ?? "Our History"}
                  </h2>
                </div>
                <div className="h-px bg-sidebar-active/40" />
              </div>

              {/* Prose */}
              {page?.content ? (
                <div
                  className="prose prose-sm max-w-none text-foreground/90 [&_a]:text-primary [&_a]:underline leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: prepareContent(page.content) }}
                />
              ) : (
                <div className="text-center py-12">
                  <Landmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Check back later.</p>
                </div>
              )}

              {/* Last updated */}
              {page?.updatedAt && (
                <p className="text-[11px] text-muted-foreground pt-4 border-t border-border">
                  Last updated {format(new Date(page.updatedAt), "MMMM d, yyyy")}
                </p>
              )}

            </div>
          </div>

        </div>
      )}
    </HistoryLayout>
  );
}
