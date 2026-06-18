import { useGetUpcomingBirthdays, useListBirthdays } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { DateBadge } from "@/components/ui/date-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cake, Star } from "lucide-react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-foreground flex items-center gap-2">
            <Cake className="h-6 w-6 text-muted-foreground" />
            Birthday Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Celebrating our Brethren
          </p>
        </div>

        {/* Upcoming birthdays */}
        <Card className="border-card-border" data-testid="section-upcoming-birthdays">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Upcoming — Next 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : upcoming.length > 0 ? (
              <div className="divide-y divide-border -mx-2">
                {upcoming.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-2 py-2.5" data-testid={`upcoming-birthday-${b.id}`}>
                    <div className="flex items-center gap-3">
                      <DateBadge
                        month={b.month}
                        day={b.day}
                        year={new Date(Date.now() + b.daysUntil * 86400000).getFullYear()}
                        variant="amber"
                        size="sm"
                      />
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          {b.firstName} {b.lastName}
                        </span>
                        {b.age !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            {b.daysUntil === 0 ? `Turns ${b.age}` : `Turning ${b.age + 1}`} · {b.year}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-sm ${
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
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Cake className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No birthdays in the next 30 days.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Full calendar by month */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">All Birthdays by Month</h2>
          {calendarLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="border-card-border">
                  <CardContent className="pt-4">
                    <Skeleton className="h-5 w-24 mb-3" />
                    <div className="space-y-2">
                      {[1, 2].map((j) => <Skeleton key={j} className="h-7 w-full" />)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : months.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="birthday-calendar-grid">
              {months.map((month) => (
                <Card key={month.month} className="border-card-border" data-testid={`month-${month.month}`}>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold">
                      {month.monthName}
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                        ({month.birthdays.length})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y divide-border -mx-2">
                      {month.birthdays.map((b) => (
                        <div key={b.id} className="flex items-center justify-between px-2 py-1.5">
                          <div>
                            <span className="text-sm text-foreground">
                              {b.firstName} {b.lastName}
                            </span>
                            {b.age !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                {b.daysUntil === 0 ? `Turns ${b.age}` : `Turning ${b.age + 1}`} · {b.year}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
                            {b.year !== undefined
                              ? `${MONTH_ABBR[b.month - 1]} ${ordinal(b.day)}, ${b.year}`
                              : `${MONTH_ABBR[b.month - 1]} ${ordinal(b.day)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-card-border">
              <CardContent className="py-12 text-center">
                <Cake className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No birthdays on file yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  An administrator can add dates of birth to member profiles
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
