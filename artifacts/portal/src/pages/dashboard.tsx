import { useAuth } from "@/hooks/use-auth";
import {
  useListAuditLogs,
  useListUsers,
  useGetUpcomingBirthdays,
  useListRoadmapItems,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, Shield, Clock, Cake, Map } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

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
    <Card className="border-card-border" data-testid="widget-upcoming-birthdays">
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

function RoadmapWidget({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useListRoadmapItems();
  const items = data?.items ?? [];
  const featured = items.filter((i) => i.status !== "completed").slice(0, 5);
  const completedCount = items.filter((i) => i.status === "completed").length;

  return (
    <Card className="border-card-border" data-testid="widget-roadmap">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Map className="h-4 w-4 text-muted-foreground" />
            Coming Next
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
          <div className="space-y-2">
            {featured.map((item) => {
              const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG["planned"];
              return (
                <div key={item.id} className="flex items-start gap-2 py-0.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 mt-0.5 ${cfg.cls}`}
                  >
                    {cfg.label}
                  </span>
                  <span className="text-sm text-foreground leading-snug">{item.title}</span>
                </div>
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
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some((r) => r.permissionLevel >= 80) ?? false;

  const { data: usersData, isLoading: usersLoading } = useListUsers();
  const { data: auditData, isLoading: auditLoading } = useListAuditLogs({ limit: 5, offset: 0 });

  const totalMembers = usersData?.users?.length ?? 0;
  const activeMembers = usersData?.users?.filter((u) => u.membershipStatus === "active").length ?? 0;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-foreground">
            Welcome, {user?.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {user?.roles?.map((r) => r.name).join(", ")}
          </p>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UpcomingBirthdaysWidget />
          <RoadmapWidget isAdmin={isAdmin} />
        </div>

        {isAdmin && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Recent Activity
              </h2>
              <Link href="/admin/audit-log" className="text-xs text-primary hover:underline" data-testid="link-view-all-audit">View all</Link>
            </div>
            <div className="bg-card border border-card-border rounded-sm divide-y divide-border">
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
      <div className="bg-card border border-card-border rounded-sm p-4 hover:border-primary/30 transition-colors group">
        <div className="flex items-center gap-2 text-muted-foreground mb-2 group-hover:text-primary transition-colors">
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
