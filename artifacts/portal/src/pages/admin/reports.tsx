import { useState, type ComponentType } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListUsers,
  useListBirthdays,
  useListEvents,
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
  TrendingUp, CircleUser,
} from "lucide-react";
import { format, subDays, isAfter, isBefore, parseISO } from "date-fns";
import { VISITOR_LEVEL, MEMBER_LEVEL, ADMIN_LEVEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

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

export default function AdminReportsPage() {
  const { data: usersData, isLoading: usersLoading } = useListUsers({ limit: 1000, offset: 0 });
  const { data: birthdayData, isLoading: birthdaysLoading } = useListBirthdays();
  const { data: eventsData, isLoading: eventsLoading } = useListEvents({});

  const [rosterSearch, setRosterSearch] = useState("");
  const [birthdayWindow, setBirthdayWindow] = useState<30 | 60 | 90>(30);
  const [newMemberWindow, setNewMemberWindow] = useState<30 | 90 | 180>(30);

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

  const allBirthdayEntries = (birthdayData?.months ?? []).flatMap(m => m.entries);
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
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="roster">Member Roster</TabsTrigger>
            <TabsTrigger value="birthdays">Birthdays</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="new-members">New Members</TabsTrigger>
          </TabsList>

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
        </Tabs>
      </div>
    </AppLayout>
  );
}
