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

function ElegantDivider() {
  return (
    <div className="flex items-center gap-3 my-1" aria-hidden="true">
      <div className="flex-1 h-px bg-border" />
      <div className="w-1.5 h-1.5 bg-sidebar-active/50 rotate-45 shrink-0" />
      <div className="flex-1 h-px bg-border" />
    </div>
  );
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
          <div className="relative px-8 py-10 text-center border-b border-border bg-primary/[0.015] overflow-hidden">
            {/* Watermark — Masonic G, 3% opacity */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              aria-hidden="true"
            >
              <span className="text-[220px] font-serif font-bold text-primary opacity-[0.03] leading-none tracking-tighter">
                G
              </span>
            </div>

            {/* Hero content */}
            <div className="relative">
              <div className="inline-flex items-center gap-3 mb-5">
                <span className="h-px w-8 bg-sidebar-active/50" />
                <span className="text-[11px] font-semibold tracking-widest text-sidebar-active uppercase">
                  1959 – Present
                </span>
                <span className="h-px w-8 bg-sidebar-active/50" />
              </div>
              <h1 className="text-2xl font-serif font-bold text-primary mb-2 leading-snug">
                General John J. Pershing Lodge No. 307
              </h1>
              <p className="text-sm text-muted-foreground">
                A Heritage of Military Service, Brotherhood and Freemasonry
              </p>
            </div>
          </div>

          {/* Article */}
          <div className="px-6 py-10">
            <div className="max-w-[850px] mx-auto">

              {/* Section header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-bold text-sidebar-active bg-sidebar-active/10 border border-sidebar-active/30 px-2.5 py-1 rounded-sm tracking-wider">
                    1959
                  </span>
                  <h2 className="text-xl font-serif font-semibold text-primary">
                    {page?.title ?? "Our History"}
                  </h2>
                </div>
                <ElegantDivider />
              </div>

              {/* Prose */}
              {page?.content ? (
                <div
                  className={[
                    "max-w-none leading-7 text-[15px] text-foreground/90",
                    "[&_p]:mb-5 [&_p]:leading-7",
                    "[&_h2]:font-serif [&_h2]:text-[10px] [&_h2]:font-bold [&_h2]:tracking-[0.2em]",
                    "[&_h2]:uppercase [&_h2]:text-sidebar-active [&_h2]:mt-12 [&_h2]:mb-0.5",
                    "[&_h2_a]:no-underline [&_h2_a]:text-sidebar-active [&_h2_a]:cursor-text [&_h2_a]:pointer-events-none",
                    "[&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-primary [&_h3]:mt-1 [&_h3]:mb-4",
                    "[&_h3_a]:no-underline [&_h3_a]:text-primary [&_h3_a]:cursor-text [&_h3_a]:pointer-events-none",
                    "[&_h4]:font-serif [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-primary [&_h4]:mt-8 [&_h4]:mb-3",
                    "[&_a]:text-primary [&_a]:underline",
                    "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-5",
                    "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-5",
                    "[&_li]:mb-1.5",
                    "[&_strong]:font-semibold [&_strong]:text-foreground",
                    "[&_blockquote]:border-l-2 [&_blockquote]:border-sidebar-active/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-6",
                  ].join(" ")}
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
                <div className="mt-10">
                  <ElegantDivider />
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Last updated {format(new Date(page.updatedAt), "MMMM d, yyyy")}
                  </p>
                </div>
              )}

            </div>
          </div>

        </div>
      )}
    </HistoryLayout>
  );
}
