import { useGetPershingBio } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
import { Skeleton } from "@/components/ui/skeleton";
import pershingPortrait from "@assets/JohnJPershing_1781792629576.jpg";

function ElegantDivider() {
  return (
    <div className="flex items-center gap-2.5 my-10" aria-hidden="true">
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
    <p key={i} className="text-sm leading-relaxed text-foreground/85 mt-4 first:mt-0">
      {p.replace(/\n/g, " ")}
    </p>
  ));
}

export default function PershingBiographyPage() {
  const { data, isLoading } = useGetPershingBio();
  const bio = data?.bio;

  return (
    <HistoryLayout>
      {isLoading ? (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
          <div className="px-8 py-10 border-b border-border text-center space-y-3">
            <Skeleton className="h-6 w-72 mx-auto" />
            <Skeleton className="h-4 w-32 mx-auto" />
          </div>
          <div className="px-6 py-8 max-w-[850px] mx-auto space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">

          {/* Hero header */}
          <div className="px-8 py-10 text-center border-b border-border bg-primary/[0.015]">
            <div className="inline-flex items-center gap-3 mb-5">
              <span className="h-px w-8 bg-sidebar-active/50" />
              <span className="text-[11px] font-semibold tracking-widest text-sidebar-active uppercase">
                Lodge Namesake
              </span>
              <span className="h-px w-8 bg-sidebar-active/50" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-primary mb-1 leading-snug">
              General John J. Pershing
            </h1>
            <p className="text-sm text-muted-foreground">1860 – 1948</p>
          </div>

          {/* Body */}
          <div className="px-6 py-10">
            <div className="max-w-[850px] mx-auto">

              {/* Portrait + Opening */}
              <div className="flex flex-col sm:flex-row gap-7 items-start mb-8">
                <div className="shrink-0 mx-auto sm:mx-0">
                  <div className="relative">
                    <img
                      src={pershingPortrait}
                      alt="General John J. Pershing"
                      className="w-36 h-36 rounded-full object-cover"
                      style={{
                        objectPosition: "center 12%",
                        border: "2px solid hsl(var(--sidebar-active))",
                        filter: "grayscale(100%) contrast(1.2) brightness(1.05)",
                        boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center mt-2 leading-tight">
                    General of the Armies
                    <br />
                    United States Army
                  </p>
                </div>

                <div className="flex-1 history-article">
                  {bio?.biographyText
                    ? renderBodyText(bio.biographyText)
                    : (
                      <p className="text-sm text-muted-foreground italic">
                        Biography content not yet available.
                      </p>
                    )}
                </div>
              </div>

              <ElegantDivider />

              {/* Lodge Connection Section */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-[10px] font-bold text-sidebar-active bg-sidebar-active/10 border border-sidebar-active/30 px-2.5 py-1 rounded-sm tracking-wider whitespace-nowrap shrink-0">
                    The Lodge
                  </span>
                  <h2 className="text-[1.15rem] font-serif font-semibold text-primary leading-snug">
                    Why the Lodge Bears His Name
                  </h2>
                </div>
                <div className="history-article">
                  {bio?.lodgeConnectionText
                    ? renderBodyText(bio.lodgeConnectionText)
                    : (
                      <p className="text-sm text-muted-foreground italic">
                        Content not yet available.
                      </p>
                    )}
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </HistoryLayout>
  );
}
