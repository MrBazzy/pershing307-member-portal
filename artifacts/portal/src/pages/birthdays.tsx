import { useGetUpcomingBirthdays, useListBirthdays } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { DateBadge } from "@/components/ui/date-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Cake } from "lucide-react";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

export default function BirthdaysPage() {
  const { data: upcomingData, isLoading: upcomingLoading } = useGetUpcomingBirthdays();
  const { data: calendarData, isLoading: calendarLoading } = useListBirthdays();

  const upcoming = upcomingData?.birthdays ?? [];
  const months = calendarData?.months ?? [];

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cake className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-serif font-bold text-primary">Birthday Calendar</h1>
          </div>
          <p className="text-sm text-muted-foreground">Celebrating our Brethren</p>
        </div>

        {/* Upcoming — Next 30 Days */}
        <div data-testid="section-upcoming-birthdays">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
            Upcoming — Next 30 Days
          </h2>

          {upcomingLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.map((b, idx) => {
                const isNext = idx === 0;
                return (
                  <div
                    key={b.id}
                    data-testid={`upcoming-birthday-${b.id}`}
                    className={`border border-card-border border-t-2 border-t-sidebar-active rounded-xl bg-card overflow-hidden transition-shadow ${
                      isNext ? "shadow-lg" : "shadow-md hover:shadow-lg"
                    }`}
                  >
                    <div className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <DateBadge
                            month={b.month}
                            day={b.day}
                            year={new Date(Date.now() + b.daysUntil * 86400000).getFullYear()}
                            variant="amber"
                            size="md"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {b.firstName} {b.lastName}
                              </span>
                              {isNext && (
                                <span className="text-[10px] font-medium bg-sidebar-active/10 text-sidebar-active border border-sidebar-active/25 px-1.5 py-0.5 rounded-full leading-none">
                                  Next
                                </span>
                              )}
                            </div>
                            {b.age !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                {b.daysUntil === 0 ? `Turns ${b.age}` : `Turning ${b.age + 1}`}
                                {b.year ? ` · Born ${b.year}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-sm shrink-0 ${
                            b.daysUntil === 0
                              ? "bg-amber-100 text-amber-700 border border-amber-200"
                              : b.daysUntil <= 7
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {b.daysUntil === 0
                            ? "Today! 🎂"
                            : b.daysUntil === 1
                            ? "Tomorrow"
                            : `In ${b.daysUntil} days`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md bg-card overflow-hidden">
              <div className="py-8 text-center">
                <Cake className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No birthdays in the next 30 days.</p>
              </div>
            </div>
          )}
        </div>

        {/* All Birthdays by Month */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4 px-1">
            All Birthdays by Month
          </h2>

          {calendarLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton className="h-3.5 w-28 mb-3 ml-1" />
                  <div className="space-y-2">
                    {[1, 2].map((j) => (
                      <Skeleton key={j} className="h-14 w-full rounded-xl" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : months.length > 0 ? (
            <div className="space-y-6" data-testid="birthday-calendar-grid">
              {months.map((month) => (
                <div key={month.month} data-testid={`month-${month.month}`}>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-1">
                    {month.monthName}
                    <span className="ml-1.5 font-normal">({month.birthdays.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {month.birthdays.map((b) => (
                      <div
                        key={b.id}
                        className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md bg-card overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        <div className="py-3 px-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <DateBadge
                              month={b.month}
                              day={b.day}
                              year={new Date().getFullYear()}
                              variant="amber"
                              size="md"
                            />
                            <div>
                              <span className="text-sm font-medium text-foreground">
                                {b.firstName} {b.lastName}
                              </span>
                              {b.age !== undefined && (
                                <p className="text-xs text-muted-foreground">
                                  {b.daysUntil === 0 ? `Turns ${b.age}` : `Turning ${b.age + 1}`}
                                  {b.year ? ` · Born ${b.year}` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {MONTH_ABBR[b.month - 1]} {ordinal(b.day)}{b.year ? `, ${b.year}` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md bg-card overflow-hidden">
              <div className="py-12 text-center">
                <Cake className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No birthdays on file yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  An administrator can add dates of birth to member profiles
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </AppLayout>
  );
}
