import { useAuth } from "@/hooks/use-auth";
import { useListAuditLogs, useListUsers } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, Shield, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

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

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: usersData, isLoading: usersLoading } = useListUsers();
  const { data: auditData, isLoading: auditLoading } = useListAuditLogs({ limit: 5, offset: 0 });

  const isAdmin = user?.roles?.some((r) => r.permissionLevel >= 70) ?? false;
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

        {!isAdmin && (
          <Card className="border-card-border">
            <CardContent className="pt-6">
              <div className="text-center py-4">
                <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Member Portal</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You are signed in as <strong>{user?.email}</strong>
                </p>
              </div>
            </CardContent>
          </Card>
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
