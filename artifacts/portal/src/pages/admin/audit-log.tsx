import { useState } from "react";
import { useListAuditLogs, getListAuditLogsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { FileText, ChevronDown } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "text-green-700 bg-green-50 border-green-200",
  LOGOUT: "text-gray-600 bg-gray-50 border-gray-200",
  LOGIN_FAILED: "text-red-700 bg-red-50 border-red-200",
  LOGIN_LOCKED: "text-orange-700 bg-orange-50 border-orange-200",
  LOGIN_2FA: "text-green-700 bg-green-50 border-green-200",
  INVITATION_CREATED: "text-blue-700 bg-blue-50 border-blue-200",
  INVITATION_ACCEPTED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  INVITATION_REVOKED: "text-yellow-700 bg-yellow-50 border-yellow-200",
  USER_DEACTIVATED: "text-red-700 bg-red-50 border-red-200",
  USER_ACTIVATED: "text-green-700 bg-green-50 border-green-200",
  ROLE_GRANTED: "text-purple-700 bg-purple-50 border-purple-200",
  ROLE_REVOKED: "text-purple-700 bg-purple-50 border-purple-200",
  BOOTSTRAP_COMPLETED: "text-purple-700 bg-purple-50 border-purple-200",
  PASSWORD_RESET_REQUESTED: "text-yellow-700 bg-yellow-50 border-yellow-200",
  PASSWORD_RESET_COMPLETED: "text-green-700 bg-green-50 border-green-200",
};

const PAGE_SIZE = 50;

export default function AdminAuditLogPage() {
  const [page, setPage] = useState(0);

  const { data: page0, isLoading } = useListAuditLogs(
    { limit: PAGE_SIZE, offset: 0 },
    { query: { queryKey: getListAuditLogsQueryKey({ limit: PAGE_SIZE, offset: 0 }) } }
  );

  const { data: page1, isFetching: fetching1 } = useListAuditLogs(
    { limit: PAGE_SIZE, offset: PAGE_SIZE },
    { query: { queryKey: getListAuditLogsQueryKey({ limit: PAGE_SIZE, offset: PAGE_SIZE }), enabled: page >= 1 } }
  );

  const { data: page2, isFetching: fetching2 } = useListAuditLogs(
    { limit: PAGE_SIZE, offset: PAGE_SIZE * 2 },
    { query: { queryKey: getListAuditLogsQueryKey({ limit: PAGE_SIZE, offset: PAGE_SIZE * 2 }), enabled: page >= 2 } }
  );

  const allLogs = [
    ...(page0?.logs ?? []),
    ...(page >= 1 ? (page1?.logs ?? []) : []),
    ...(page >= 2 ? (page2?.logs ?? []) : []),
  ];

  const lastPageData = page === 0 ? page0 : page === 1 ? page1 : page2;
  const hasMore = (lastPageData?.logs?.length ?? 0) >= PAGE_SIZE && page < 2;
  const isLoadingMore = fetching1 || fetching2;

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-semibold">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Complete record of security and administrative events
            </p>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Target</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-36" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-24" /></td>
                    </tr>
                  ))
                : allLogs.map((log) => {
                    const actionCls = ACTION_COLORS[log.action] ?? "text-muted-foreground bg-muted border-border";
                    return (
                      <tr key={log.id} className="hover:bg-muted/20 transition-colors" data-testid={`audit-log-row-${log.id}`}>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground truncate max-w-[160px] block">
                            {log.actorEmail ?? <span className="italic">System</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${actionCls}`}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          {log.targetType && (
                            <span className="text-xs text-muted-foreground">{log.targetType}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 hidden xl:table-cell">
                          {log.ipAddress && (
                            <span className="text-xs text-muted-foreground font-mono">{log.ipAddress}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {!isLoading && allLogs.length === 0 && (
            <div className="px-4 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No audit log entries yet</p>
            </div>
          )}

          {!isLoading && hasMore && (
            <div className="px-4 py-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => setPage((p) => p + 1)}
                disabled={isLoadingMore}
                data-testid="button-load-more"
              >
                {isLoadingMore
                  ? "Loading..."
                  : <><ChevronDown className="h-4 w-4 mr-2" /> Load More</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
