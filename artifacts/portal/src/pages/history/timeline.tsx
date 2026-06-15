import { useListHistoryTimeline } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";

interface TimelineEntry {
  id: string;
  year: number;
  title: string;
  description: string | null;
  sortOrder: number;
}

function displayYear(year: number): string {
  return year === 9999 ? "Present" : String(year);
}

export default function HistoricalTimelinePage() {
  const { data, isLoading } = useListHistoryTimeline();
  const entries = (data?.entries ?? []) as TimelineEntry[];

  return (
    <HistoryLayout>
      <p className="text-sm text-muted-foreground mb-2">
        Key moments in the Lodge's history, listed chronologically.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-card-border">
              <CardContent className="py-4 flex gap-4">
                <Skeleton className="h-10 w-16 shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="py-14 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No timeline entries yet. Check back later.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-[4.5rem] top-0 bottom-0 w-px bg-border hidden sm:block" />
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-4 items-start">
                <div className="w-16 shrink-0 text-right">
                  <span className="inline-block font-bold text-primary text-sm leading-tight pt-3.5">
                    {displayYear(entry.year)}
                  </span>
                </div>
                <Card className="border-card-border flex-1 sm:ml-4">
                  <CardContent className="py-3.5 px-4">
                    <h3 className="text-sm font-semibold text-foreground leading-snug">
                      {entry.title}
                    </h3>
                    {entry.description && (
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                        {entry.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </HistoryLayout>
  );
}
