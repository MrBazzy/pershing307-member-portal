import { useState, type ComponentType } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListUsers,
  useListBirthdays,
  useListEvents,
  useGetMemberDetailsReport,
  useGetDocumentAccessReport,
  useListInvitations,
  useRevokeInvitation,
  useCleanupInvitations,
  type MemberDetailItem,
  type DocumentAccessDomainItem,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3, Users, Cake, CalendarDays, UserPlus, Printer, Search,
  TrendingUp, CircleUser, FileText, FolderOpen, ShieldCheck,
  Mail, Send, RefreshCw, XCircle, CheckCircle2, Clock, AlertTriangle,
  MinusCircle, Download, Trash2, ExternalLink,
} from "lucide-react";
import { format, subDays, isAfter, isBefore, parseISO, isPast } from "date-fns";
import { VISITOR_LEVEL, MEMBER_LEVEL, ADMIN_LEVEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type OnboardingStatus = "not_invited" | "pending" | "accepted" | "expired" | "revoked";
type OnboardingFilter = "all" | OnboardingStatus;

const INV_STATUS_LABEL: Record<OnboardingStatus, string> = {
  not_invited: "Not Invited",
  pending: "Invitation Sent",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

const INV_STATUS_COLOR: Record<OnboardingStatus, string> = {
  not_invited: "bg-muted text-muted-foreground border-0",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0",
  accepted: "bg-green-500/15 text-green-700 dark:text-green-400 border-0",
  expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-0",
  revoked: "bg-red-500/15 text-red-700 dark:text-red-400 border-0",
};

const INV_STATUS_ICON: Record<OnboardingStatus, ComponentType<{ className?: string }>> = {
  not_invited: MinusCircle,
  pending: Clock,
  accepted: CheckCircle2,
  expired: AlertTriangle,
  revoked: XCircle,
};

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string;
  value: number | string;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card className="border-card-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <div className={cn("rounded-md p-1.5", color ?? "bg-primary/10")}>
            <Icon className={cn("h-4 w-4", color ? "text-white" : "text-primary")} />
          </div>
        </div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const DEGREE_ABBR: Record<number, string> = { 1: "EA", 2: "FC", 3: "MM" };

function MemberDetailRow({ member, index }: { member: MemberDetailItem; index: number }) {
  return (
    <tr className="hover:bg-muted/30 transition-colors align-top print:hover:bg-transparent">
      <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">{index}</td>
      <td className="px-3 py-2.5 font-medium text-foreground text-sm whitespace-nowrap">
        {member.lastName}, {member.firstName}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs">{member.email}</td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
        {member.dateOfBirth ? format(parseISO(member.dateOfBirth), "MMM d, yyyy") : "—"}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
        {format(parseISO(member.createdAt), "MMM d, yyyy")}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
        {member.lastLoginAt ? format(parseISO(member.lastLoginAt), "MMM d, yyyy") : "—"}
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {member.noticeAcceptedAt ? (
          <span className="text-foreground">{format(parseISO(member.noticeAcceptedAt), "MMM d, yyyy")}</span>
        ) : (
          <span className="text-muted-foreground/50 italic">Not accepted</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {member.roles.length === 0 ? (
          <span className="text-xs text-muted-foreground/50 italic">None</span>
        ) : (
          <div className="space-y-0.5">
            {member.roles.map((r) => (
              <div key={r.slug} className="text-xs text-foreground leading-snug">{r.name}</div>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        {member.degrees.length === 0 ? (
          <span className="text-xs text-muted-foreground/50 italic">None</span>
        ) : (
          <div className="space-y-0.5">
            {member.degrees.map((d) => (
              <div key={d.degree} className="text-xs leading-snug whitespace-nowrap">
                <span className="font-semibold text-foreground">{DEGREE_ABBR[d.degree] ?? `Deg ${d.degree}`}</span>
                {d.conferredOn && (
                  <span className="text-muted-foreground"> · {format(parseISO(d.conferredOn), "MMM d, yyyy")}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function AdminReportsPage() {
  const { toast } = useToast();

  const { data: usersData, isLoading: usersLoading } = useListUsers({ limit: 1000, offset: 0 });
  const { data: birthdayData, isLoading: birthdaysLoading } = useListBirthdays();
  const { data: eventsData, isLoading: eventsLoading } = useListEvents({});
  const { data: memberDetailsData, isLoading: memberDetailsLoading } = useGetMemberDetailsReport();
  const { data: docAccessData, isLoading: docAccessLoading } = useGetDocumentAccessReport();
  const { data: invitationsData, isLoading: invitationsLoading, refetch: refetchInvitations } = useListInvitations();

  const revokeInvitation = useRevokeInvitation();
  const cleanupInvitations = useCleanupInvitations();

  const [rosterSearch, setRosterSearch] = useState("");
  const [birthdayWindow, setBirthdayWindow] = useState<30 | 60 | 90>(30);
  const [newMemberWindow, setNewMemberWindow] = useState<30 | 90 | 180>(30);
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>("all");
  const [onboardingSearch, setOnboardingSearch] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);

  const now = new Date();
  const allUsers = usersData?.users ?? [];

  const highestLevel = (u: typeof allUsers[0]) =>
    (u.roles ?? []).reduce((max, r) => Math.max(max, r.permissionLevel), 0);

  const admins   = allUsers.filter(u => highestLevel(u) >= ADMIN_LEVEL);
  const members  = allUsers.filter(u => { const l = highestLevel(u); return l >= MEMBER_LEVEL && l < ADMIN_LEVEL; });
  const visitors = allUsers.filter(u => { const l = highestLevel(u); return l >= VISITOR_LEVEL && l < MEMBER_LEVEL; });
  const noRole   = allUsers.filter(u => highestLevel(u) < VISITOR_LEVEL);

  const newIn = (days: number) =>
    allUsers.filter(u => isAfter(parseISO(u.createdAt), subDays(now, days))).length;

  const rosterFiltered = allUsers.filter(u => {
    if (!rosterSearch.trim()) return true;
    const q = rosterSearch.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const allBirthdayEntries = (birthdayData?.months ?? []).flatMap(m => m.birthdays ?? []);
  const upcomingBirthdays = allBirthdayEntries
    .filter(b => b.daysUntil >= 0 && b.daysUntil <= birthdayWindow)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const allEvents = eventsData?.events ?? [];
  const upcomingEvents = allEvents
    .filter(e => !isBefore(parseISO(e.date), now))
    .sort((a, b) => a.date.localeCompare(b.date));
  const recentPastEvents = allEvents
    .filter(e => isBefore(parseISO(e.date), now) && isAfter(parseISO(e.date), subDays(now, 30)))
    .sort((a, b) => b.date.localeCompare(a.date));

  const newMembers = allUsers
    .filter(u => isAfter(parseISO(u.createdAt), subDays(now, newMemberWindow)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Build invitation lookup: email → latest invitation per member
  const allInvitations = invitationsData?.invitations ?? [];
  const invByEmail: Record<string, typeof allInvitations[0]> = {};
  for (const inv of allInvitations) {
    const key = inv.email.toLowerCase();
    if (!invByEmail[key] || new Date(inv.createdAt) > new Date(invByEmail[key].createdAt)) {
      invByEmail[key] = inv;
    }
  }

  function getInvStatus(inv: typeof allInvitations[0] | undefined): OnboardingStatus {
    if (!inv) return "not_invited";
    if (inv.acceptedAt) return "accepted";
    if (inv.revokedAt) return "revoked";
    if (isPast(new Date(inv.expiresAt))) return "expired";
    return "pending";
  }

  const onboardingRows = allUsers.map(user => {
    const inv = invByEmail[user.email.toLowerCase()] ?? null;
    const invStatus = getInvStatus(inv ?? undefined);
    return { user, inv, invStatus };
  });

  const onboardingFiltered = onboardingRows
    .filter(r => onboardingFilter === "all" || r.invStatus === onboardingFilter)
    .filter(r => {
      if (!onboardingSearch.trim()) return true;
      const q = onboardingSearch.toLowerCase();
      return (
        `${r.user.firstName} ${r.user.lastName}`.toLowerCase().includes(q) ||
        r.user.email.toLowerCase().includes(q)
      );
    });

  const onboardingSummary = (() => {
    const counts: Record<OnboardingStatus, number> = { not_invited: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 };
    for (const r of onboardingRows) counts[r.invStatus]++;
    const completionPct = onboardingRows.length > 0
      ? Math.round(counts.accepted / onboardingRows.length * 100)
      : 0;
    return { ...counts, total: onboardingRows.length, completionPct };
  })();

  // Invitations that are expired or revoked (eligible for cleanup)
  const cleanupEligibleCount = allInvitations.filter(
    inv => inv.revokedAt || (!inv.acceptedAt && isPast(new Date(inv.expiresAt)))
  ).length;

  const handleSendInvitation = async (userId: string) => {
    setActioningId(userId);
    try {
      const createRes = await fetch(`/api/users/${userId}/invitations`, {
        method: "POST",
        credentials: "include",
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create invitation");
      }
      const { invitation } = await createRes.json();
      const sendRes = await fetch(`/api/invitations/${invitation.id}/send`, {
        method: "POST",
        credentials: "include",
      });
      if (!sendRes.ok) throw new Error("Failed to send invitation email");
      await refetchInvitations();
      toast({ title: "Invitation sent", description: "Invitation email sent successfully." });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to send invitation.",
        variant: "destructive",
      });
    } finally {
      setActioningId(null);
    }
  };

  const handleResendInvitation = async (invId: string, userId: string) => {
    setActioningId(userId);
    try {
      const res = await fetch(`/api/invitations/${invId}/send`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to resend invitation email");
      await refetchInvitations();
      toast({ title: "Invitation resent", description: "Email resent successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to resend invitation.", variant: "destructive" });
    } finally {
      setActioningId(null);
    }
  };

  const handleRevokeInvitation = (invId: string, userId: string) => {
    setActioningId(userId);
    revokeInvitation.mutate({ id: invId }, {
      onSuccess: () => {
        refetchInvitations();
        toast({ title: "Invitation revoked" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to revoke invitation.", variant: "destructive" });
      },
      onSettled: () => setActioningId(null),
    });
  };

  const handleCleanup = () => {
    cleanupInvitations.mutate(undefined, {
      onSuccess: (data) => {
        refetchInvitations();
        setCleanupConfirm(false);
        const deleted = (data as { deleted?: number })?.deleted ?? 0;
        toast({ title: "Cleanup complete", description: `${deleted} expired/revoked invitation${deleted !== 1 ? "s" : ""} removed.` });
      },
      onError: () => {
        toast({ title: "Error", description: "Cleanup failed.", variant: "destructive" });
      },
    });
  };

  const exportOnboardingCsv = () => {
    const headers = ["Name", "Email", "Status", "Invitation Created", "Accepted", "Expires", "Joined", "Last Login"];
    const rows = onboardingFiltered.map(r => [
      `"${r.user.firstName} ${r.user.lastName}"`,
      r.user.email,
      INV_STATUS_LABEL[r.invStatus],
      r.inv ? format(parseISO(r.inv.createdAt), "yyyy-MM-dd") : "",
      r.inv?.acceptedAt ? format(parseISO(r.inv.acceptedAt), "yyyy-MM-dd") : "",
      r.inv ? format(parseISO(r.inv.expiresAt), "yyyy-MM-dd") : "",
      format(parseISO(r.user.createdAt), "yyyy-MM-dd"),
      r.user.lastLoginAt ? format(parseISO(r.user.lastLoginAt), "yyyy-MM-dd") : "",
    ]);
    const content = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `member-onboarding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (status: string | null | undefined) => {
    if (status === "active") return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0 text-[11px]">Active</Badge>;
    if (status === "pending") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 text-[11px]">Pending</Badge>;
    return <Badge variant="secondary" className="text-[11px]">{status ?? "—"}</Badge>;
  };

  const roleBadge = (permissionLevel: number) => {
    if (permissionLevel >= ADMIN_LEVEL) return <Badge className="bg-primary/10 text-primary border-0 text-[11px]">Admin</Badge>;
    if (permissionLevel >= MEMBER_LEVEL) return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-0 text-[11px]">Member</Badge>;
    if (permissionLevel >= VISITOR_LEVEL) return <Badge variant="secondary" className="text-[11px]">Visitor</Badge>;
    return <Badge variant="outline" className="text-[11px] text-muted-foreground">No role</Badge>;
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Membership statistics, rosters, and activity summaries.
          </p>
        </div>

        <Tabs defaultValue="overview">
          <div className="overflow-x-auto pb-1">
            <TabsList className="mb-6 flex w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="roster">Member Roster</TabsTrigger>
              <TabsTrigger value="birthdays">Birthdays</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="new-members">New Members</TabsTrigger>
              <TabsTrigger value="member-details">Member Details</TabsTrigger>
              <TabsTrigger value="doc-access">Document Access</TabsTrigger>
              <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
            </TabsList>
          </div>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-6">
            {usersLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Total Members" value={allUsers.length} sub="all registered users" icon={Users} />
                  <StatCard label="Admins" value={admins.length} icon={CircleUser} color="bg-primary" />
                  <StatCard label="Members" value={members.length} icon={Users} color="bg-blue-600" />
                  <StatCard label="Visitors" value={visitors.length} icon={Users} color="bg-slate-500" />
                </div>

                <Card className="border-card-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      New Members
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      {[
                        { label: "Last 30 days", days: 30 },
                        { label: "Last 90 days", days: 90 },
                        { label: "Last 365 days", days: 365 },
                      ].map(({ label, days }) => (
                        <div key={days} className="py-3 border border-card-border rounded-lg">
                          <p className="text-2xl font-bold text-foreground">{newIn(days)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-card-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Membership Status Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { label: "Admin", count: admins.length, pct: allUsers.length ? Math.round(admins.length / allUsers.length * 100) : 0, color: "bg-primary" },
                      { label: "Member", count: members.length, pct: allUsers.length ? Math.round(members.length / allUsers.length * 100) : 0, color: "bg-blue-500" },
                      { label: "Visitor", count: visitors.length, pct: allUsers.length ? Math.round(visitors.length / allUsers.length * 100) : 0, color: "bg-slate-400" },
                      { label: "No role", count: noRole.length, pct: allUsers.length ? Math.round(noRole.length / allUsers.length * 100) : 0, color: "bg-muted-foreground/30" },
                    ].filter(r => r.count > 0).map(row => (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground w-16 shrink-0">{row.label}</span>
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className={cn("h-2 rounded-full transition-all", row.color)}
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-foreground w-8 text-right">{row.count}</span>
                        <span className="text-xs text-muted-foreground w-8 text-right">{row.pct}%</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── MEMBER ROSTER ── */}
          <TabsContent value="roster" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search name or email…"
                  value={rosterSearch}
                  onChange={e => setRosterSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print
              </Button>
            </div>

            {usersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : (
              <Card className="border-card-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border bg-muted/40">
                        <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Role</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {rosterFiltered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-muted-foreground">No members found.</td>
                        </tr>
                      ) : rosterFiltered.map(u => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {u.firstName} {u.lastName}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-3">
                            {roleBadge(highestLevel(u))}
                          </td>
                          <td className="px-4 py-3">{statusBadge(u.membershipStatus)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {format(parseISO(u.createdAt), "MMM d, yyyy")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-card-border bg-muted/20 text-xs text-muted-foreground">
                  {rosterFiltered.length} of {allUsers.length} member{allUsers.length !== 1 ? "s" : ""}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── BIRTHDAYS ── */}
          <TabsContent value="birthdays" className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show next</span>
              {([30, 60, 90] as const).map(d => (
                <Button
                  key={d}
                  size="sm"
                  variant={birthdayWindow === d ? "default" : "outline"}
                  onClick={() => setBirthdayWindow(d)}
                >
                  {d} days
                </Button>
              ))}
            </div>

            {birthdaysLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : upcomingBirthdays.length === 0 ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-12 text-center">
                  <Cake className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No birthdays in the next {birthdayWindow} days.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-card-border overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">
                    {upcomingBirthdays.length} birthday{upcomingBirthdays.length !== 1 ? "s" : ""} in the next {birthdayWindow} days
                  </CardTitle>
                </CardHeader>
                <div className="divide-y divide-card-border">
                  {upcomingBirthdays.map(b => (
                    <div key={b.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-pink-500/10 p-2 shrink-0">
                          <Cake className="h-4 w-4 text-pink-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.firstName} {b.lastName}</p>
                          <p className="text-xs text-muted-foreground">
                            {MONTH_NAMES[b.month - 1]} {b.day}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={b.daysUntil === 0 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {b.daysUntil === 0 ? "Today!" : b.daysUntil === 1 ? "Tomorrow" : `in ${b.daysUntil} days`}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── EVENTS ── */}
          <TabsContent value="events" className="space-y-6">
            {eventsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Upcoming Events
                    <Badge variant="secondary" className="font-normal">{upcomingEvents.length}</Badge>
                  </h2>
                  {upcomingEvents.length === 0 ? (
                    <Card className="border-card-border border-dashed">
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">No upcoming events.</CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {upcomingEvents.map(e => (
                        <Card key={e.id} className="border-card-border">
                          <CardContent className="p-4 flex items-start gap-4">
                            <div className="rounded-md bg-primary/10 px-3 py-2 text-center shrink-0 min-w-[52px]">
                              <p className="text-[10px] font-semibold text-primary uppercase">
                                {format(parseISO(e.date), "MMM")}
                              </p>
                              <p className="text-lg font-bold text-primary leading-tight">
                                {format(parseISO(e.date), "d")}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{e.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {e.categoryName && (
                                  <span className="text-xs text-muted-foreground">{e.categoryName}</span>
                                )}
                                {e.location && (
                                  <span className="text-xs text-muted-foreground">· {e.location}</span>
                                )}
                                {e.startTime && (
                                  <span className="text-xs text-muted-foreground">· {e.startTime}</span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    Recent Past Events
                    <span className="text-[11px] text-muted-foreground font-normal normal-case">(last 30 days)</span>
                    <Badge variant="secondary" className="font-normal">{recentPastEvents.length}</Badge>
                  </h2>
                  {recentPastEvents.length === 0 ? (
                    <Card className="border-card-border border-dashed">
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">No events in the last 30 days.</CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {recentPastEvents.map(e => (
                        <Card key={e.id} className="border-card-border opacity-75">
                          <CardContent className="p-4 flex items-start gap-4">
                            <div className="rounded-md bg-muted px-3 py-2 text-center shrink-0 min-w-[52px]">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                                {format(parseISO(e.date), "MMM")}
                              </p>
                              <p className="text-lg font-bold text-muted-foreground leading-tight">
                                {format(parseISO(e.date), "d")}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{e.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {e.categoryName && (
                                  <span className="text-xs text-muted-foreground">{e.categoryName}</span>
                                )}
                                {e.location && (
                                  <span className="text-xs text-muted-foreground">· {e.location}</span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── NEW MEMBERS ── */}
          <TabsContent value="new-members" className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Joined in last</span>
              {([30, 90, 180] as const).map(d => (
                <Button
                  key={d}
                  size="sm"
                  variant={newMemberWindow === d ? "default" : "outline"}
                  onClick={() => setNewMemberWindow(d)}
                >
                  {d} days
                </Button>
              ))}
            </div>

            {usersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : newMembers.length === 0 ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-12 text-center">
                  <UserPlus className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No new members in the last {newMemberWindow} days.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-card-border overflow-hidden">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">
                    {newMembers.length} member{newMembers.length !== 1 ? "s" : ""} joined in the last {newMemberWindow} days
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-card-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Email</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Role</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {newMembers.map(u => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {u.firstName} {u.lastName}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-3">{roleBadge(highestLevel(u))}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {format(parseISO(u.createdAt), "MMM d, yyyy")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── MEMBER DETAILS ── */}
          <TabsContent value="member-details" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Full member records — name, email, date of birth, joined date, last login, all roles, and all degrees with conferred dates.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="shrink-0"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Print
              </Button>
            </div>

            {memberDetailsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : !memberDetailsData?.members?.length ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-12 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No member records found.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-card-border overflow-hidden">
                <CardHeader className="pb-0 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {memberDetailsData.members.length} member{memberDetailsData.members.length !== 1 ? "s" : ""}
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-card-border bg-muted/40">
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date of Birth</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Login</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notice Accepted</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Roles</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Degrees</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {memberDetailsData.members.map((m, i) => (
                        <MemberDetailRow key={m.id} member={m} index={i + 1} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── DOCUMENT ACCESS ── */}
          <TabsContent value="doc-access" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Shows which members can access each protected document domain, and why.
              </p>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print
              </Button>
            </div>

            {docAccessLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
              </div>
            ) : !docAccessData?.domains?.length ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-12 text-center">
                  <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No protected domains configured yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5 print:space-y-6">
                {docAccessData.domains.map((domain: DocumentAccessDomainItem) => (
                  <Card key={domain.id} className="border-card-border overflow-hidden print:break-inside-avoid">
                    <CardHeader className="pb-2 pt-4 px-4 print:pb-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                            {domain.name}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[11px] font-mono">{domain.slug}</Badge>
                            <Badge
                              className={cn("text-[11px] border-0", domain.frame === "ritual" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400")}
                            >
                              {domain.frame}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {domain.folderCount} folder{domain.folderCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Access rule:{" "}
                            <span className="font-medium text-foreground">
                              {domain.accessLogic === "role_only" && `Role only (${domain.allowedRoleSlugs.join(", ") || "none"})`}
                              {domain.accessLogic === "degree_only" && `Degree ≥ ${domain.minDegree ?? "—"}`}
                              {domain.accessLogic === "role_or_degree" && `Role (${domain.allowedRoleSlugs.join(", ") || "none"}) or Degree ≥ ${domain.minDegree ?? "—"}`}
                              {domain.accessLogic === "role_and_degree" && `Role (${domain.allowedRoleSlugs.join(", ") || "none"}) and Degree ≥ ${domain.minDegree ?? "—"}`}
                            </span>
                          </p>
                        </div>
                        <Badge className="shrink-0 bg-primary/10 text-primary border-0">
                          {domain.members.length} member{domain.members.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </CardHeader>

                    {domain.members.length === 0 ? (
                      <CardContent className="pb-4 pt-2 px-4">
                        <p className="text-xs text-muted-foreground italic">No members currently have access to this domain.</p>
                      </CardContent>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-y border-card-border bg-muted/40">
                              <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Name</th>
                              <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide print:table-cell hidden sm:table-cell">Email</th>
                              <th className="text-left px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Access via</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-card-border">
                            {domain.members.map((m) => (
                              <tr key={m.id} className="hover:bg-muted/30 transition-colors print:hover:bg-transparent">
                                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                                  {m.lastName}, {m.firstName}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground text-xs print:table-cell hidden sm:table-cell">
                                  {m.email}
                                </td>
                                <td className="px-4 py-2.5">
                                  <Badge
                                    className={cn("text-[11px] border-0", m.accessReason === "Explicit grant" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-green-500/15 text-green-700 dark:text-green-400")}
                                  >
                                    {m.accessReason}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── MEMBER ONBOARDING PROGRESS ── */}
          <TabsContent value="onboarding" className="space-y-4">

            {/* Summary stat row */}
            {invitationsLoading || usersLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Accepted"
                  value={onboardingSummary.accepted}
                  sub={`${onboardingSummary.completionPct}% of members`}
                  icon={CheckCircle2}
                  color="bg-green-600"
                />
                <StatCard
                  label="Awaiting Response"
                  value={onboardingSummary.pending}
                  sub="invitation sent"
                  icon={Clock}
                  color="bg-amber-500"
                />
                <StatCard
                  label="Not Invited"
                  value={onboardingSummary.not_invited}
                  sub="no invitation yet"
                  icon={MinusCircle}
                />
                <StatCard
                  label="Expired / Revoked"
                  value={onboardingSummary.expired + onboardingSummary.revoked}
                  sub="needs attention"
                  icon={AlertTriangle}
                  color="bg-orange-500"
                />
              </div>
            )}

            {/* Filter + search bar + actions */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {(["all", "not_invited", "pending", "accepted", "expired", "revoked"] as const).map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={onboardingFilter === f ? "default" : "outline"}
                    className="text-xs h-7 px-2.5"
                    onClick={() => setOnboardingFilter(f)}
                  >
                    {f === "all" ? "All" : INV_STATUS_LABEL[f as OnboardingStatus]}
                    {f === "all" && (
                      <span className="ml-1.5 rounded-full bg-muted-foreground/20 text-foreground text-[10px] font-semibold px-1 leading-tight">
                        {onboardingSummary.total}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm w-48"
                    placeholder="Search…"
                    value={onboardingSearch}
                    onChange={e => setOnboardingSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" className="h-8" onClick={exportOnboardingCsv}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  CSV
                </Button>
                {cleanupEligibleCount > 0 && (
                  cleanupConfirm ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleCleanup}
                        disabled={cleanupInvitations.isPending}
                      >
                        {cleanupInvitations.isPending ? "Cleaning…" : `Delete ${cleanupEligibleCount}`}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCleanupConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setCleanupConfirm(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Cleanup ({cleanupEligibleCount})
                    </Button>
                  )
                )}
              </div>
            </div>

            {/* Detail table */}
            {invitationsLoading || usersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : onboardingFiltered.length === 0 ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-12 text-center">
                  <Mail className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No members match the current filter.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-card-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border bg-muted/40">
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Member</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Invitation Sent</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">Accepted / Expires</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">First Login</th>
                        <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {onboardingFiltered.map(({ user, inv, invStatus }) => {
                        const StatusIcon = INV_STATUS_ICON[invStatus];
                        const isActioning = actioningId === user.id;
                        return (
                          <tr key={user.id} className="hover:bg-muted/30 transition-colors align-middle">
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground text-sm leading-tight">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={cn("text-[11px] flex items-center gap-1 w-fit", INV_STATUS_COLOR[invStatus])}>
                                <StatusIcon className="h-3 w-3 shrink-0" />
                                {INV_STATUS_LABEL[invStatus]}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {inv ? format(parseISO(inv.createdAt), "MMM d, yyyy") : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {invStatus === "accepted" && inv?.acceptedAt ? (
                                <span className="text-green-700 dark:text-green-400">
                                  {format(parseISO(inv.acceptedAt), "MMM d, yyyy")}
                                </span>
                              ) : invStatus === "pending" && inv ? (
                                <span className="text-muted-foreground">
                                  Exp. {format(parseISO(inv.expiresAt), "MMM d, yyyy")}
                                </span>
                              ) : invStatus === "expired" && inv ? (
                                <span className="text-orange-600 dark:text-orange-400">
                                  Expired {format(parseISO(inv.expiresAt), "MMM d, yyyy")}
                                </span>
                              ) : invStatus === "revoked" && inv?.revokedAt ? (
                                <span className="text-red-600 dark:text-red-400">
                                  Revoked {format(parseISO(inv.revokedAt), "MMM d, yyyy")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {user.lastLoginAt ? format(parseISO(user.lastLoginAt), "MMM d, yyyy") : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 justify-end">
                                {invStatus === "not_invited" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2.5"
                                    disabled={isActioning}
                                    onClick={() => handleSendInvitation(user.id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    {isActioning ? "Sending…" : "Send Invitation"}
                                  </Button>
                                )}
                                {invStatus === "pending" && inv && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2.5"
                                      disabled={isActioning}
                                      onClick={() => handleResendInvitation(inv.id, user.id)}
                                    >
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      {isActioning ? "Sending…" : "Resend"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      disabled={isActioning}
                                      onClick={() => handleRevokeInvitation(inv.id, user.id)}
                                    >
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Revoke
                                    </Button>
                                  </>
                                )}
                                {(invStatus === "expired" || invStatus === "revoked") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2.5"
                                    disabled={isActioning}
                                    onClick={() => handleSendInvitation(user.id)}
                                  >
                                    <Send className="h-3 w-3 mr-1" />
                                    {isActioning ? "Sending…" : "Re-invite"}
                                  </Button>
                                )}
                                <a href="/admin/users" title="Open member record">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-card-border bg-muted/20 text-xs text-muted-foreground">
                  {onboardingFiltered.length} of {onboardingRows.length} member{onboardingRows.length !== 1 ? "s" : ""}
                </div>
              </Card>
            )}

            {cleanupConfirm && (
              <p className="text-xs text-muted-foreground text-right">
                This will permanently delete {cleanupEligibleCount} expired/revoked invitation record{cleanupEligibleCount !== 1 ? "s" : ""} from the database. This cannot be undone.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
