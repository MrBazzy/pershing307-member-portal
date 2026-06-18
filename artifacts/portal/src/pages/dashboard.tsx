import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import squareAndCompasses from "@assets/FR_1781777880230.jpg";
import {
  useListAuditLogs,
  useListUsers,
  useGetUpcomingBirthdays,
  useListRoadmapItems,
  useGetUpcomingTracingBoardEntries,
  useGetUpcomingEvents,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { DateBadge } from "@/components/ui/date-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, Activity, Shield, Clock, Cake, Map, ChevronRight, BookOpen, CalendarDays, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";
import { VISITOR_LEVEL, MEMBER_LEVEL, ADMIN_LEVEL } from "@/lib/roles";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  "planned":     { label: "Planned",     cls: "bg-gray-100 text-gray-700 border-gray-200" },
  "in-progress": { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  "completed":   { label: "Completed",   cls: "bg-green-100 text-green-700 border-green-200" },
  "future-idea": { label: "Future Idea", cls: "bg-purple-100 text-purple-700 border-purple-200" },
};

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    LOGIN: "bg-green-100 text-green-800 border-green-200",
    LOGOUT: "bg-gray-100 text-gray-700 border-gray-200",
    LOGIN_FAILED: "bg-red-100 text-red-800 border-red-200",
    LOGIN_LOCKED: "bg-orange-100 text-orange-800 border-orange-200",
    INVITATION_CREATED: "bg-blue-100 text-blue-800 border-blue-200",
    INVITATION_ACCEPTED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    INVITATION_REVOKED: "bg-yellow-100 text-yellow-800 border-yellow-200",
    USER_DEACTIVATED: "bg-red-100 text-red-800 border-red-200",
    USER_ACTIVATED: "bg-green-100 text-green-800 border-green-200",
    BOOTSTRAP_COMPLETED: "bg-purple-100 text-purple-800 border-purple-200",
    PASSWORD_RESET_REQUESTED: "bg-yellow-100 text-yellow-800 border-yellow-200",
    PASSWORD_RESET_COMPLETED: "bg-green-100 text-green-800 border-green-200",
  };
  const cls = colorMap[action] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${cls}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function UpcomingBirthdaysWidget() {
  const { data, isLoading } = useGetUpcomingBirthdays();
  const birthdays = data?.birthdays ?? [];

  return (
    <Card data-testid="widget-upcoming-birthdays">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Cake className="h-4 w-4 text-muted-foreground" />
          Upcoming Birthdays
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : birthdays.length > 0 ? (
          <div className="divide-y divide-border -mx-2">
            {birthdays.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between px-2 py-2">
                <span className="text-sm font-medium text-foreground">
                  {b.firstName} {b.lastName}
                </span>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <div className="text-right">
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {b.year !== undefined
                        ? `${MONTH_ABBR[b.month - 1]} ${b.day}, ${b.year}`
                        : `${MONTH_ABBR[b.month - 1]} ${b.day}`}
                    </span>
                    {b.age !== undefined && (
                      <span className="block text-[10px] text-muted-foreground/70">
                        {b.daysUntil === 0 ? `Turns ${b.age}` : `Turning ${b.age + 1}`}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      b.daysUntil === 0
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {b.daysUntil === 0
                      ? "Today!"
                      : b.daysUntil === 1
                      ? "Tomorrow"
                      : `In ${b.daysUntil}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No birthdays in the next 30 days
          </p>
        )}
        <div className="mt-3 pt-3 border-t border-border">
          <Link href="/birthdays" className="text-xs text-primary hover:underline" data-testid="link-birthday-calendar">
            View full calendar →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface RoadmapItemShape {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

function RoadmapDetailSheet({
  item,
  onClose,
}: {
  item: RoadmapItemShape | null;
  onClose: () => void;
}) {
  const cfg = item ? (STATUS_CONFIG[item.status] ?? STATUS_CONFIG["planned"]) : null;
  return (
    <Sheet open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {item && cfg && (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="font-serif pr-6">{item.title}</SheetTitle>
            </SheetHeader>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description</p>
                {item.description ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {item.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No description provided.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Last Updated</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(item.updatedAt), "MMMM d, yyyy")}
                </p>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RoadmapWidget({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useListRoadmapItems();
  const [selectedItem, setSelectedItem] = useState<RoadmapItemShape | null>(null);

  const items = (data?.items ?? []) as RoadmapItemShape[];
  const featured = items.filter((i) => i.status !== "completed").slice(0, 5);
  const completedCount = items.filter((i) => i.status === "completed").length;

  return (
    <>
      <Card data-testid="widget-roadmap">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Map className="h-4 w-4 text-muted-foreground" />
              Planned Portal Features
            </span>
            {isAdmin && (
              <Link
                href="/admin/roadmap"
                className="text-xs text-primary hover:underline font-normal"
                data-testid="link-manage-roadmap"
              >
                Manage →
              </Link>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : featured.length > 0 ? (
            <div className="space-y-1">
              {featured.map((item) => {
                const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG["planned"];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="w-full flex items-start gap-2 py-1.5 px-1 rounded-sm text-left hover:bg-accent/50 transition-colors group"
                    data-testid={`roadmap-item-${item.id}`}
                  >
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 mt-0.5 ${cfg.cls}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-sm text-foreground leading-snug flex-1">{item.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No upcoming features to show
            </p>
          )}
          {completedCount > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {completedCount} feature{completedCount !== 1 ? "s" : ""} already completed
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <RoadmapDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  );
}

function UpcomingActivitiesWidget({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useGetUpcomingTracingBoardEntries({ limit: 5 });
  const entries = (data?.entries ?? []) as Array<{
    id: string; title: string; date: string; startTime: string | null;
    location: string | null; categoryName: string | null;
  }>;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          Tracing Board
        </CardTitle>
        <Link href="/tracing-board" className="text-xs text-primary hover:underline">View all</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No Tracing Board entries in the next 30 days.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                <DateBadge date={e.date} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug truncate">{e.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.startTime ?? ""}
                    {e.startTime && e.location ? " · " : ""}
                    {e.location ?? ""}
                  </p>
                </div>
                {e.categoryName && (
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                    {e.categoryName}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="mt-3 pt-2 border-t border-border">
            <Link href="/admin/tracing-board" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Manage Tracing Board →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingEventsWidget({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useGetUpcomingEvents({ limit: 5 });
  const events = (data?.events ?? []) as Array<{
    id: string; title: string; date: string; startTime: string | null;
    location: string | null; categoryName: string | null;
  }>;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Upcoming Events
        </CardTitle>
        <Link href="/events" className="text-xs text-primary hover:underline">View all</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No upcoming Events in the next 30 days.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                <DateBadge date={e.date} size="sm" variant="amber" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug truncate">{e.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.startTime ?? ""}
                    {e.startTime && e.location ? " · " : ""}
                    {e.location ?? ""}
                  </p>
                </div>
                {e.categoryName && (
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                    {e.categoryName}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="mt-3 pt-2 border-t border-border">
            <Link href="/admin/events" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Manage Events →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminStatsSection() {
  const { data: usersData, isLoading: usersLoading } = useListUsers();
  const { data: auditData, isLoading: auditLoading } = useListAuditLogs({ limit: 5, offset: 0 });

  const totalMembers = usersData?.users?.length ?? 0;
  const activeMembers = usersData?.users?.filter((u) => u.membershipStatus === "active").length ?? 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total Members"
          value={usersLoading ? null : String(totalMembers)}
          href="/admin/users"
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Active Members"
          value={usersLoading ? null : String(activeMembers)}
          href="/admin/users"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Recent Events"
          value={auditLoading ? null : String(auditData?.logs?.length ?? 0)}
          href="/admin/audit-log"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Recent Activity
          </h2>
          <Link href="/admin/audit-log" className="text-xs text-primary hover:underline" data-testid="link-view-all-audit">View all</Link>
        </div>
        <div className="bg-card border border-card-border rounded-xl shadow-sm divide-y divide-border overflow-hidden">
          {auditLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))
          ) : auditData?.logs && auditData.logs.length > 0 ? (
            auditData.logs.map((log) => (
              <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3" data-testid={`audit-row-${log.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <ActionBadge action={log.action} />
                  {log.actorEmail && (
                    <span className="text-xs text-muted-foreground truncate">{log.actorEmail}</span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No activity recorded yet
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const level = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;

  const hasNoRole = level === 0;
  const isVisitor = level >= VISITOR_LEVEL && level < MEMBER_LEVEL;
  const isMember = level >= MEMBER_LEVEL;
  const isAdmin = level >= ADMIN_LEVEL;

  const roleLabel = user?.roles?.map((r) => r.name).join(", ") || (hasNoRole ? "No role assigned" : "");

  return (
    <AppLayout>
      {/* Fixed Masonic watermark — dashboard only, stays in place while cards scroll over */}
      <div
        className="fixed inset-0 md:left-60 hidden md:flex items-center justify-center pointer-events-none select-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <img
          src={squareAndCompasses}
          alt=""
          className="w-[500px] h-[500px] object-contain opacity-[0.04]"
        />
      </div>

      <div className="relative p-6 max-w-5xl mx-auto space-y-6" style={{ zIndex: 1 }}>
        <div>
          <h1 className="text-2xl font-serif font-semibold text-primary">
            Welcome, {user?.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{roleLabel}</p>
        </div>

        {/* No-role: warning only */}
        {hasNoRole && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 font-semibold">No membership role assigned</AlertTitle>
            <AlertDescription className="text-amber-700">
              Please contact your Site Administrator to receive a Membership role.
            </AlertDescription>
          </Alert>
        )}

        {/* Visitor: Tracing Board widget only */}
        {isVisitor && (
          <UpcomingActivitiesWidget isAdmin={false} />
        )}

        {/* Member+: full dashboard */}
        {isMember && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <UpcomingActivitiesWidget isAdmin={isAdmin} />
              <UpcomingEventsWidget isAdmin={isAdmin} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <UpcomingBirthdaysWidget />
              <RoadmapWidget isAdmin={isAdmin} />
            </div>

            {isAdmin && <AdminStatsSection />}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href: string;
}) {
  return (
    <Link href={href} className="block" data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="bg-card border border-card-border rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow group">
        <div className="flex items-center gap-2 text-muted-foreground mb-2 group-hover:text-primary/80 transition-colors">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <p className="text-2xl font-semibold font-serif text-foreground">{value}</p>
        )}
      </div>
    </Link>
  );
}
