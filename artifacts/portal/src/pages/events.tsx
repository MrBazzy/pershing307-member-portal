import { useState } from "react";
import { useListEvents, useListEventCategories } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { DateBadge } from "@/components/ui/date-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, MapPin, List, Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  categoryId: string | null;
  categoryName: string | null;
  visibility: string;
  organizerId: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatTime(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start} – ${end}` : start;
}

function groupByMonth(events: EventItem[]): { label: string; month: string; events: EventItem[] }[] {
  const groups: Record<string, EventItem[]> = {};
  for (const e of events) {
    const key = e.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, events]) => ({
      label: format(parseISO(key + "-01"), "MMMM yyyy"),
      month: key,
      events,
    }));
}

function AgendaView({ events }: { events: EventItem[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today);
  const groups = groupByMonth(upcoming);
  const pastGroups = groupByMonth(past);

  return (
    <div className="space-y-6">
      {groups.length === 0 && (
        <Card className="border-card-border">
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No upcoming Events in the next 30 days.</p>
          </CardContent>
        </Card>
      )}
      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            {group.label}
          </h2>
          <div className="space-y-2">
            {group.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
      {pastGroups.length > 0 && (
        <details className="group">
          <summary className="text-xs font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer select-none list-none flex items-center gap-2 mb-3 px-1">
            <span>Past Events ({past.length})</span>
          </summary>
          <div className="space-y-6 mt-4">
            {pastGroups.reverse().map((group) => (
              <div key={group.label}>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1 opacity-60">
                  {group.label}
                </h2>
                <div className="space-y-2 opacity-60">
                  {group.events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventItem }) {
  return (
    <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md bg-card overflow-hidden hover:border-primary/30 transition-colors">
      <div className="py-3 px-4">
        <div className="flex items-start gap-3">
          <DateBadge date={event.date} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground leading-snug">{event.title}</p>
              {event.categoryName && (
                <span className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                  {event.categoryName}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
              {formatTime(event.startTime, event.endTime) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTime(event.startTime, event.endTime)}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </span>
              )}
            </div>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">
                {event.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ events }: { events: EventItem[] }) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDow = startOfMonth(currentMonth).getDay();

  const eventsByDate: Record<string, EventItem[]> = {};
  for (const e of events) {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  }

  const selectedDateStr = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedEvents = selectedDateStr ? (eventsByDate[selectedDateStr] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>‹</Button>
        <span className="text-sm font-semibold text-foreground">{format(currentMonth, "MMMM yyyy")}</span>
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>›</Button>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase pb-1">
            {d}
          </div>
        ))}
        {Array.from({ length: startDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const hasEvents = (eventsByDate[dateStr]?.length ?? 0) > 0;
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const today = isToday(day);
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={cn(
                "relative flex flex-col items-center justify-start py-1 rounded text-xs transition-colors min-h-[36px]",
                isSelected ? "bg-primary text-primary-foreground" : today ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground"
              )}
            >
              <span>{format(day, "d")}</span>
              {hasEvents && (
                <span className={cn("w-1 h-1 rounded-full mt-0.5", isSelected ? "bg-primary-foreground" : "bg-primary")} />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            {format(selectedDay, "EEEE, MMMM d")}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground px-1">No events on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  const [view, setView] = useState<"agenda" | "calendar">("agenda");
  const { data, isLoading } = useListEvents({});
  const events = (data?.events ?? []) as EventItem[];

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-serif font-bold text-primary">Events</h1>
            </div>
            <p className="text-sm text-muted-foreground">Social, educational and special lodge events</p>
          </div>
          <div className="flex items-center gap-1 border border-border rounded-sm p-0.5">
            <Button
              variant={view === "agenda" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setView("agenda")}
              data-testid="view-agenda"
            >
              <List className="h-3.5 w-3.5 mr-1.5" />
              List View
            </Button>
            <Button
              variant={view === "calendar" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setView("calendar")}
              data-testid="view-calendar"
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              Calendar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : view === "agenda" ? (
          <AgendaView events={events} />
        ) : (
          <Card className="border-card-border">
            <CardContent className="p-5">
              <CalendarView events={events} />
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
