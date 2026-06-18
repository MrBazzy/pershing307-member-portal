import { useListHistorySections } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark } from "lucide-react";
import squareAndCompasses from "@assets/FR_1781777880230.jpg";

function ElegantDivider() {
  return (
    <div className="flex items-center gap-2.5" aria-hidden="true">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-1 shrink-0">
        <div className="w-1.5 h-1.5 bg-sidebar-active/50 rotate-45" />
        <div className="w-1.5 h-1.5 bg-sidebar-active/50 rotate-45" />
        <div className="w-1.5 h-1.5 bg-sidebar-active/50 rotate-45" />
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function renderBodyText(text: string) {
  if (!text.trim()) return null;
  const paras = text.split(/\n\n+/).filter(Boolean);
  return paras.map((p, i) => (
    <p key={i} className="text-sm leading-relaxed text-foreground/85 mt-3 first:mt-0 whitespace-pre-wrap">
      {p.replace(/\n/g, " ")}
    </p>
  ));
}

interface Section {
  id: string;
  yearPeriod: string;
  chapterTitle: string;
  bodyText: string;
  sortOrder: number;
}

export default function OurHistoryPage() {
  const { data, isLoading } = useListHistorySections();
  const sections = (data?.sections ?? []) as Section[];

  return (
    <HistoryLayout>
      {isLoading ? (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
          <div className="px-8 py-10 border-b border-border text-center space-y-3">
            <Skeleton className="h-4 w-24 mx-auto" />
            <Skeleton className="h-6 w-72 mx-auto" />
            <Skeleton className="h-4 w-56 mx-auto" />
          </div>
          <div className="px-6 py-8 max-w-[850px] mx-auto space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-px w-full" />
                <div className="flex items-center gap-3 mt-4">
                  <Skeleton className="h-6 w-14" />
                  <Skeleton className="h-5 w-48" />
                </div>
                <Skeleton className="h-4 w-full mt-3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">

          {/* Hero */}
          <div className="relative px-8 py-10 text-center border-b border-border bg-primary/[0.015] overflow-hidden">
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
              aria-hidden="true"
            >
              <img
                src={squareAndCompasses}
                alt=""
                className="w-56 h-56 object-contain opacity-[0.04]"
              />
            </div>
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

          {/* Sections */}
          <div className="px-6 py-10">
            <div className="max-w-[850px] mx-auto">

              {sections.length === 0 ? (
                <div className="text-center py-12">
                  <Landmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Check back later.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {sections.map((section, idx) => (
                    <div key={section.id} className="chapter-section">
                      {idx > 0 && (
                        <div className="my-8">
                          <ElegantDivider />
                        </div>
                      )}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[10px] font-bold text-sidebar-active bg-sidebar-active/10 border border-sidebar-active/30 px-2.5 py-1 rounded-sm tracking-wider whitespace-nowrap shrink-0">
                          {section.yearPeriod}
                        </span>
                        <h2 className="text-[1.15rem] font-serif font-semibold text-primary leading-snug">
                          {section.chapterTitle}
                        </h2>
                      </div>
                      <div className="history-article">
                        {renderBodyText(section.bodyText)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

        </div>
      )}
    </HistoryLayout>
  );
}
