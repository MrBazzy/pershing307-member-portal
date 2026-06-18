import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  useListLodgeYears,
  useGetActiveLodgeYear,
  useListTracingBoardEntries,
  getListTracingBoardEntriesQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { DateBadge } from "@/components/ui/date-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Calendar, Clock, MapPin, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";

const VISIBILITY_LABELS: Record<string, string> = {
  members: "Members",
  ea_plus: "EA+",
  fc_plus: "FC+",
  mm_only: "MM Only",
  officers: "Officers",
  past_masters: "Past Masters",
};

interface TBEntry {
  id: string;
  lodgeYearId: string;
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

function groupByMonth(entries: TBEntry[]): { label: string; entries: TBEntry[] }[] {
  const groups: Record<string, TBEntry[]> = {};
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => ({
      label: format(parseISO(key + "-01"), "MMMM yyyy"),
      entries,
    }));
}

function formatTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start} – ${end}` : start;
}

export default function TracingBoardPage() {
  const { data: yearsData, isLoading: yearsLoading } = useListLodgeYears();
  const { data: activeData } = useGetActiveLodgeYear();
  const years = (yearsData?.years ?? []).filter((y) => y.status !== "draft");
  const activeYearId = activeData?.year?.id ?? null;

  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const effectiveYearId = selectedYearId ?? activeYearId;

  const { data: entriesData, isLoading: entriesLoading } = useListTracingBoardEntries(
    effectiveYearId ? { lodgeYearId: effectiveYearId } : {}
  );
  const entries = (entriesData?.entries ?? []) as TBEntry[];
  const groups = groupByMonth(entries);

  const selectedYear = years.find((y) => y.id === effectiveYearId);

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-serif font-bold text-primary">Tracing Board</h1>
            </div>
            <p className="text-sm text-muted-foreground">Official lodge year programme</p>
          </div>
          {years.length > 1 && (
            <Select
              value={effectiveYearId ?? ""}
              onValueChange={(v) => setSelectedYearId(v)}
            >
              <SelectTrigger className="w-40 text-sm" data-testid="year-selector">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.title}
                    {y.status === "active" && " ★"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedYear && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{selectedYear.title}</span>
            <Badge
              variant="outline"
              className={
                selectedYear.status === "active"
                  ? "border-green-300 bg-green-50 text-green-700 text-[10px]"
                  : "border-gray-300 bg-gray-50 text-gray-600 text-[10px]"
              }
            >
              {selectedYear.status === "active" ? "Active Year" : "Historical"}
            </Badge>
          </div>
        )}

        {yearsLoading || entriesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !effectiveYearId ? (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No active lodge year has been set up yet.</p>
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No entries for this lodge year.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
                  {group.label}
                </h2>
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <Card key={entry.id} className="border-card-border hover:border-primary/30 transition-colors">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <DateBadge date={entry.date} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-foreground leading-snug">{entry.title}</p>
                              {entry.categoryName && (
                                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                                  {entry.categoryName}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                              {formatTime(entry.startTime, entry.endTime) && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(entry.startTime, entry.endTime)}
                                </span>
                              )}
                              {entry.location && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {entry.location}
                                </span>
                              )}
                            </div>
                            {entry.description && (
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                                {entry.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
