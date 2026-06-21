import { useState, useEffect } from "react";
import {
  useListUsers, useListRoles, useGetUser, useDeactivateUser, useActivateUser,
  useGrantUserRole, useRevokeUserRole, useGetUserDegrees,
  useListDegreeDefinitions,
  useAddUserDegree, useRemoveUserDegree,
  useUpdateUserMembershipStatus, useFixMembership, useAdminResetPassword,
  useUpdateDateOfBirth, useUpdateUserName, useAdminUpdateUserEmail,
  useRevokeInvitation,
  listUserPasskeys, revokeUserPasskey,
  getListUsersQueryKey, getGetUserQueryKey, getGetUserDegreesQueryKey,
  getListInvitationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow, format } from "date-fns";
import {
  Users, UserX, UserCheck, Plus, Trash2, Search, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, KeyRound, Copy, Check, Fingerprint, History,
  LogIn, Shield, Award, UserCog, Mail, Key, Lock, Unlock,
  LayoutDashboard, User2, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

// --- Types ---

type TimelineEvent = {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type UserInvitation = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedByFirstName: string | null;
  invitedByLastName: string | null;
  invitedByEmail: string | null;
};

// --- Fetch functions ---

async function getUserTimeline(userId: string): Promise<{ events: TimelineEvent[]; userCreatedAt: string }> {
  const res = await fetch(`/api/users/${userId}/timeline`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load timeline");
  return res.json();
}

async function createMemberApi(data: { firstName: string; lastName: string; email: string }): Promise<{ user: { id: string; email: string; firstName: string; lastName: string } }> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw err;
  }
  return res.json();
}

async function deleteMemberApi(userId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/users/${userId}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw err;
  }
  return res.json();
}

async function listUserInvitationsApi(userId: string): Promise<{ invitations: UserInvitation[] }> {
  const res = await fetch(`/api/users/${userId}/invitations`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load invitations");
  return res.json();
}

async function createUserInvitationApi(userId: string): Promise<{ invitation: UserInvitation; smtpConfigured: boolean }> {
  const res = await fetch(`/api/users/${userId}/invitations`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw err;
  }
  return res.json();
}

async function sendInvitationEmailApi(invitationId: string): Promise<{ success: boolean; smtpConfigured: boolean }> {
  const res = await fetch(`/api/invitations/${invitationId}/send`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw err;
  }
  return res.json();
}

async function getInvitationLinkApi(invitationId: string): Promise<{ link: string }> {
  const res = await fetch(`/api/invitations/${invitationId}/link`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to get invitation link");
  return res.json();
}

// --- Timeline helpers ---

function getEventLabel(action: string, detail: Record<string, unknown> | null): string {
  const d = detail ?? {};
  switch (action) {
    case "LOGIN": return "Signed in";
    case "LOGIN_2FA": return "Signed in with two-factor authentication";
    case "USER_ACTIVATED": return "Account activated";
    case "USER_DEACTIVATED": return "Account deactivated";
    case "MEMBER_CREATED": return "Member profile created";
    case "MEMBER_DELETED": return "Member deleted";
    case "MEMBERSHIP_STATUS_CHANGED": return d.to ? `Membership status changed to ${d.to}` : "Membership status changed";
    case "INVITATION_CREATED": return "Invitation created";
    case "INVITATION_SENT": return "Invitation sent";
    case "INVITATION_ACCEPTED": return "Invitation accepted";
    case "INVITATION_REVOKED": return "Invitation revoked";
    case "PASSWORD_RESET_REQUESTED": return "Password reset requested";
    case "PASSWORD_RESET_COMPLETED": return "Password reset";
    case "PASSWORD_CHANGED": return "Password changed";
    case "PASSWORD_CHANGED_AFTER_RESET": return "Password changed after reset";
    case "PASSWORD_RESET_BY_ADMIN": return "Password reset by administrator";
    case "PASSKEY_REGISTERED": return d.label ? `Passkey registered: ${d.label}` : "Passkey registered";
    case "PASSKEY_REMOVED": return d.label ? `Passkey removed: ${d.label}` : "Passkey removed";
    case "PASSKEY_REVOKED_BY_ADMIN": return d.label ? `Passkey revoked: ${d.label}` : "Passkey revoked by administrator";
    case "2FA_ENROLLED": return "Two-factor authentication enabled";
    case "2FA_DISABLED": return "Two-factor authentication disabled";
    case "ROLE_GRANTED": return d.roleName ? `Role ${d.roleName} granted` : "Role granted";
    case "ROLE_REVOKED": return d.roleName ? `Role ${d.roleName} revoked` : "Role revoked";
    case "DEGREE_RECORDED": return d.degreeName ? `${d.degreeName} degree recorded` : "Degree recorded";
    case "DEGREE_REMOVED": return d.degreeName ? `${d.degreeName} degree removed` : "Degree removed";
    case "USER_NAME_UPDATED": return "Name updated";
    case "USER_EMAIL_UPDATED": return "Email address updated";
    case "DOB_UPDATED": return "Date of birth updated";
    case "DOMAIN_ACCESS_GRANTED": return "Document domain access granted";
    case "DOMAIN_ACCESS_REVOKED": return "Document domain access revoked";
    default: return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function getEventIcon(action: string) {
  if (action === "LOGIN" || action === "LOGIN_2FA") return <LogIn className="h-3 w-3" />;
  if (action.startsWith("ROLE_")) return <Shield className="h-3 w-3" />;
  if (action.startsWith("DEGREE_")) return <Award className="h-3 w-3" />;
  if (action.startsWith("INVITATION_")) return <Mail className="h-3 w-3" />;
  if (action.startsWith("PASSKEY_") || action.startsWith("2FA_")) return <Key className="h-3 w-3" />;
  if (action.startsWith("PASSWORD_")) return <Lock className="h-3 w-3" />;
  if (action === "USER_ACTIVATED" || action === "MEMBER_CREATED") return <Unlock className="h-3 w-3" />;
  if (action === "USER_DEACTIVATED") return <Lock className="h-3 w-3" />;
  return <UserCog className="h-3 w-3" />;
}

function getEventDotColor(action: string): string {
  if (action === "LOGIN" || action === "LOGIN_2FA") return "bg-blue-500";
  if (action.startsWith("ROLE_")) return "bg-violet-500";
  if (action.startsWith("DEGREE_")) return "bg-amber-500";
  if (action.startsWith("INVITATION_")) return "bg-emerald-500";
  if (action.startsWith("PASSKEY_") || action.startsWith("2FA_")) return "bg-sky-500";
  if (action.startsWith("PASSWORD_")) return "bg-orange-500";
  if (action === "USER_ACTIVATED" || action === "MEMBER_CREATED") return "bg-green-500";
  if (action === "USER_DEACTIVATED") return "bg-red-500";
  return "bg-muted-foreground";
}

// --- Invitation status helpers ---

type InvStatus = "not_invited" | "pending" | "accepted" | "expired" | "revoked";

function getInvitationStatus(invitations: UserInvitation[]): {
  status: InvStatus;
  label: string;
  latest: UserInvitation | null;
} {
  if (invitations.length === 0) return { status: "not_invited", label: "Not Invited", latest: null };
  const latest = invitations[0];
  if (latest.acceptedAt) return { status: "accepted", label: "Invitation Accepted", latest };
  if (latest.revokedAt) return { status: "revoked", label: "Invitation Revoked", latest };
  if (new Date(latest.expiresAt) < new Date()) return { status: "expired", label: "Invitation Expired", latest };
  return { status: "pending", label: "Invitation Pending", latest };
}

function invStatusClass(status: InvStatus): string {
  if (status === "accepted") return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
  if (status === "pending") return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  if (status === "revoked") return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
  return "bg-muted text-muted-foreground border-border";
}

// --- Passkeys panel ---

function AdminPasskeysPanel({ userId, onRevoked }: { userId: string | null; onRevoked: () => void }) {
  const { toast } = useToast();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-passkeys", userId],
    queryFn: () => listUserPasskeys(userId!),
    enabled: !!userId,
  });
  const passkeys = data?.passkeys ?? [];

  const handleRevoke = async (passkeyId: string, label: string) => {
    if (!userId) return;
    setRevokingId(passkeyId);
    try {
      await revokeUserPasskey(userId, passkeyId);
      toast({ title: "Passkey revoked", description: `"${label}" has been revoked.` });
      refetch();
      onRevoked();
    } catch {
      toast({ title: "Failed to revoke passkey", variant: "destructive" });
    } finally {
      setRevokingId(null);
    }
  };

  if (!userId) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Fingerprint className="h-3 w-3" /> Passkeys
        {!isLoading && (
          <span className="ml-auto font-normal tabular-nums">
            {passkeys.length === 0 ? "none registered" : `${passkeys.length} registered`}
          </span>
        )}
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!isLoading && passkeys.length === 0 && (
        <p className="text-xs text-muted-foreground">No passkeys registered.</p>
      )}
      {passkeys.map((pk) => (
        <div key={pk.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/30 rounded-sm">
          <span className="text-sm truncate">{pk.label}</span>
          <Button
            size="icon" variant="ghost"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={revokingId === pk.id}
            onClick={() => handleRevoke(pk.id, pk.label)}
            aria-label={`Revoke passkey: ${pk.label}`}
          >
            {revokingId === pk.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        </div>
      ))}
    </div>
  );
}

// --- Timeline component ---

function UserMemberTimeline({ userId, userCreatedAt }: { userId: string; userCreatedAt: string | undefined }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-timeline", userId],
    queryFn: () => getUserTimeline(userId),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const createdAtEvent: TimelineEvent | null = userCreatedAt
    ? {
        id: "__created__",
        action: "__ACCOUNT_CREATED__",
        actorId: null, actorEmail: null, actorFirstName: null, actorLastName: null,
        targetType: "user", targetId: userId, detail: null, createdAt: userCreatedAt,
      }
    : null;

  const allEvents: TimelineEvent[] = [...(data?.events ?? [])];
  if (createdAtEvent) {
    const alreadyHasCreated = allEvents.some(
      (e) => (e.action === "USER_ACTIVATED" || e.action === "MEMBER_CREATED") &&
        Math.abs(new Date(e.createdAt).getTime() - new Date(createdAtEvent.createdAt).getTime()) < 5000
    );
    if (!alreadyHasCreated) {
      allEvents.push(createdAtEvent);
      allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Skeleton className="h-5 w-5 rounded-full" />
              {i < 4 && <Skeleton className="w-px h-8 mt-1" />}
            </div>
            <div className="pb-4 space-y-1 flex-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive py-4">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Failed to load timeline.
      </div>
    );
  }

  if (allEvents.length === 0) {
    return (
      <div className="text-center py-10">
        <History className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No timeline events yet.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />
      <ul className="space-y-0">
        {allEvents.map((event, idx) => {
          const isLast = idx === allEvents.length - 1;
          const actorName = event.actorId && event.actorId !== userId
            ? [event.actorFirstName, event.actorLastName].filter(Boolean).join(" ") || event.actorEmail
            : null;
          const label = event.action === "__ACCOUNT_CREATED__"
            ? "Account created"
            : getEventLabel(event.action, event.detail);
          const dotColor = event.action === "__ACCOUNT_CREATED__" ? "bg-green-500" : getEventDotColor(event.action);

          return (
            <li key={event.id} className={cn("flex gap-3", !isLast && "pb-4")}>
              <div className="flex flex-col items-center shrink-0 z-10">
                <div className={cn("h-[18px] w-[18px] rounded-full flex items-center justify-center text-white shrink-0", dotColor)}>
                  {event.action === "__ACCOUNT_CREATED__"
                    ? <UserCog className="h-2.5 w-2.5" />
                    : <span className="text-white">{getEventIcon(event.action)}</span>}
                </div>
              </div>
              <div className="flex-1 min-w-0 pb-0.5">
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {format(new Date(event.createdAt), "d MMM yyyy, HH:mm")}
                </p>
                <p className="text-sm font-medium leading-snug mt-0.5">{label}</p>
                {actorName && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">by {actorName}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Create Member Dialog ---

function CreateMemberDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (userId: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleClose = () => {
    setFirstName(""); setLastName(""); setEmail("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    setIsPending(true);
    try {
      const result = await createMemberApi({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "Member created", description: `${result.user.firstName} ${result.user.lastName} has been added.` });
      handleClose();
      onCreated(result.user.id);
    } catch (err: any) {
      toast({ title: "Could not create member", description: err?.error ?? "An error occurred", variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Member</DialogTitle>
          <DialogDescription>
            Create a member profile without sending an invitation. You can send an invitation from the member's detail page later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">First Name</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required data-testid="input-create-first-name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Last Name</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required data-testid="input-create-last-name" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email Address</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required data-testid="input-create-email" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || !firstName.trim() || !lastName.trim() || !email.trim()} data-testid="button-confirm-create-member">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Main list page ---

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [fixConfirmOpen, setFixConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fixMembership = useFixMembership();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => { setDebouncedSearch(value); setOffset(0); }, 300);
  };

  const { data, isLoading } = useListUsers({ limit: PAGE_SIZE, offset, search: debouncedSearch || undefined });
  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const stuckCount = users.filter((u) => u.isActive && u.membershipStatus === "pending").length;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-serif font-semibold">Members</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {!isLoading ? `${total} member${total !== 1 ? "s" : ""}` : "Loading..."}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name or email..." value={search} onChange={handleSearchChange} data-testid="input-search-users" />
            </div>
            <Button onClick={() => setCreateOpen(true)} data-testid="button-create-member">
              <Plus className="h-4 w-4 mr-2" />Create Member
            </Button>
          </div>
        </div>

        {stuckCount > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-sm border border-amber-500/40 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                {stuckCount} active {stuckCount === 1 ? "member has" : "members have"} pending membership status
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">These accounts have portal access but their membership status was not set automatically.</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400" onClick={() => setFixConfirmOpen(true)} data-testid="button-fix-membership">
              Fix All
            </Button>
          </div>
        )}

        <div className="bg-card border border-card-border border-t-2 border-t-sidebar-active rounded-xl shadow-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-20" /></td>
                    </tr>
                  ))
                : users.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedUserId(user.id)} data-testid={`row-user-${user.id}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{user.firstName} {user.lastName}</p>
                        {user.membershipStatus && <p className="text-[11px] text-muted-foreground">{user.membershipStatus}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={user.isActive ? "default" : "outline"} className={cn(!user.isActive && "text-muted-foreground")}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {user.lastLoginAt ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true }) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {format(new Date(user.createdAt), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!isLoading && users.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {debouncedSearch ? `No members matching "${debouncedSearch}"` : "No members yet"}
              </p>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground bg-muted/10">
              <span>Page {currentPage} of {totalPages} &bull; {total} total</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UserDetailSheet userId={selectedUserId} onClose={() => setSelectedUserId(null)} />

      <CreateMemberDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => { setCreateOpen(false); setSelectedUserId(id); }}
      />

      <AlertDialog open={fixConfirmOpen} onOpenChange={setFixConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fix Membership Status</AlertDialogTitle>
            <AlertDialogDescription>
              This will update {stuckCount} active {stuckCount === 1 ? "user's" : "users'"} membership status from "pending" to "active" and record an audit entry for each change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={fixMembership.isPending}
              onClick={(e) => {
                e.preventDefault();
                fixMembership.mutate(undefined, {
                  onSuccess: (result) => {
                    setFixConfirmOpen(false);
                    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
                    toast({ title: `Fixed ${result.fixed} member${result.fixed !== 1 ? "s" : ""}` });
                  },
                  onError: () => toast({ title: "Failed", description: "Could not fix membership status", variant: "destructive" }),
                });
              }}
            >
              {fixMembership.isPending ? "Fixing…" : "Fix All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

// --- UserDetailSheet ---

const MEMBERSHIP_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
];

function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const [tab, setTab] = useState("overview");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [newDegree, setNewDegree] = useState("");
  const [newConferredOn, setNewConferredOn] = useState("");
  const [membershipStatusEdit, setMembershipStatusEdit] = useState("");
  const [dobEdit, setDobEdit] = useState("");
  const [firstNameEdit, setFirstNameEdit] = useState("");
  const [lastNameEdit, setLastNameEdit] = useState("");
  const [emailEdit, setEmailEdit] = useState("");
  const [pwdResetConfirmOpen, setPwdResetConfirmOpen] = useState(false);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ tempPassword: string; expiresAt: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeInvOpen, setRevokeInvOpen] = useState(false);

  useEffect(() => {
    setMembershipStatusEdit("");
    setDobEdit("");
    setFirstNameEdit("");
    setLastNameEdit("");
    setEmailEdit("");
    setDeleteConfirmName("");
  }, [userId]);

  const { data, isLoading } = useGetUser(userId ?? "", {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId ?? "") },
  });
  const { data: rolesData } = useListRoles();
  const { data: degreeDefsData } = useListDegreeDefinitions();
  const { data: userDegreesData } = useGetUserDegrees(userId ?? "", {
    query: { enabled: !!userId && tab === "roles", queryKey: getGetUserDegreesQueryKey(userId ?? "") },
  });
  const { data: invitationsData, refetch: refetchInvitations } = useQuery({
    queryKey: ["user-invitations", userId],
    queryFn: () => listUserInvitationsApi(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const deactivate = useDeactivateUser();
  const activate = useActivateUser();
  const updateMembershipStatus = useUpdateUserMembershipStatus();
  const grantRole = useGrantUserRole();
  const revokeRole = useRevokeUserRole();
  const addDegree = useAddUserDegree();
  const removeDegree = useRemoveUserDegree();
  const adminResetPassword = useAdminResetPassword();
  const updateDateOfBirth = useUpdateDateOfBirth();
  const updateUserName = useUpdateUserName();
  const adminUpdateEmail = useAdminUpdateUserEmail();
  const revokeInvitation = useRevokeInvitation();

  const deleteMemberMutation = useMutation({
    mutationFn: () => deleteMemberApi(userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "Member deleted", description: `${user?.firstName} ${user?.lastName} has been removed.` });
      onClose();
      setTab("overview");
    },
    onError: (e: any) => toast({ title: "Could not delete member", description: e?.error ?? "Action failed", variant: "destructive" }),
  });

  const createInvitationMutation = useMutation({
    mutationFn: () => createUserInvitationApi(userId!),
    onSuccess: () => {
      refetchInvitations();
      queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["user-timeline", userId] });
      toast({ title: "Invitation created", description: "Use the Send button to email the invitation." });
    },
    onError: (e: any) => toast({ title: "Could not create invitation", description: e?.error ?? "Action failed", variant: "destructive" }),
  });

  const sendInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => sendInvitationEmailApi(invitationId),
    onSuccess: (result) => {
      refetchInvitations();
      queryClient.invalidateQueries({ queryKey: ["user-timeline", userId] });
      if (result.smtpConfigured) {
        toast({ title: "Invitation sent", description: "The invitation email has been sent." });
      } else {
        toast({ title: "SMTP not configured", description: "Email could not be sent. Copy the invitation link manually.", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Could not send invitation", description: e?.error ?? "Action failed", variant: "destructive" }),
  });

  const isPmSuperAdmin = currentUser?.roles?.some((r) => r.permissionLevel >= 90) ?? false;
  const user = data?.user;
  const isSelf = !!user && user.id === currentUser?.id;
  const isBootstrapAdmin = (user as any)?.isBootstrapAdmin ?? false;
  const lockedUntil = (user as any)?.lockedUntil ?? null;
  const isLocked = !!lockedUntil && new Date(lockedUntil) > new Date();
  const isTestMember = data?.testResetEnabled ?? false;

  const userDegrees = userDegreesData?.degrees ?? [];
  const degreeDefs = degreeDefsData?.definitions ?? [
    { degree: 1, name: "Entered Apprentice", abbreviation: "EA" },
    { degree: 2, name: "Fellow Craft", abbreviation: "FC" },
    { degree: 3, name: "Master Mason", abbreviation: "MM" },
  ];

  const invitations = invitationsData?.invitations ?? [];
  const { status: invStatus, label: invStatusLabel, latest: latestInv } = getInvitationStatus(invitations);
  const activeInvId = invStatus === "pending" ? latestInv?.id ?? null : null;

  const { data: invLinkData } = useQuery({
    queryKey: ["invitation-link", activeInvId],
    queryFn: () => getInvitationLinkApi(activeInvId!),
    enabled: !!activeInvId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    if (userId) {
      queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
      queryClient.invalidateQueries({ queryKey: getGetUserDegreesQueryKey(userId) });
    }
  };

  const currentRoleIds = new Set(user?.roles?.map((r) => r.id));
  const availableRoles = rolesData?.roles?.filter(
    (r) => !currentRoleIds.has(r.id) && (isPmSuperAdmin || r.permissionLevel < 90)
  ) ?? [];

  const fullName = user ? `${user.firstName} ${user.lastName}` : "";
  const deleteNameMatches = deleteConfirmName.trim().toLowerCase() === fullName.toLowerCase();
  const canDelete = !isSelf && !isBootstrapAdmin && (isPmSuperAdmin || !(user?.roles?.some((r) => r.permissionLevel >= 90)));

  const tabs = [
    { value: "overview", icon: LayoutDashboard, label: "Overview" },
    { value: "profile", icon: User2, label: "Profile" },
    { value: "roles", icon: Shield, label: "Roles & Degrees" },
    { value: "invitations", icon: Mail, label: "Invitations" },
    { value: "security", icon: KeyRound, label: "Security" },
    { value: "timeline", icon: History, label: "Timeline" },
    { value: "danger", icon: AlertTriangle, label: "Delete" },
  ];

  return (
    <Sheet open={!!userId} onOpenChange={(open) => { if (!open) { onClose(); setTab("overview"); } }}>
      <SheetContent className="w-full sm:max-w-3xl overflow-hidden flex flex-col p-0">
        {isLoading || !user ? (
          <div className="space-y-3 p-6 pt-8">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <SheetTitle className="font-serif text-xl flex items-center gap-2 flex-wrap">
                {user.firstName} {user.lastName}
                {isBootstrapAdmin && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Bootstrap Admin</Badge>}
              </SheetTitle>
              <SheetDescription>{user.email}</SheetDescription>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TabsList className="shrink-0 flex overflow-x-auto border-b rounded-none bg-transparent px-2 h-auto pb-0 gap-0">
                {tabs.map(({ value, icon: Icon, label }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={cn(
                      "shrink-0 rounded-none border-b-2 border-transparent pb-2.5 pt-1.5 px-3 text-sm font-medium gap-1.5",
                      "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                      "hover:text-foreground transition-colors",
                      value === "danger" && "text-destructive/70 hover:text-destructive data-[state=active]:border-destructive data-[state=active]:text-destructive"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* ── OVERVIEW ── */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto px-6 py-5 space-y-5 mt-0 data-[state=inactive]:hidden">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Current Status</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatusCard label="Account">
                      {isLocked
                        ? <Badge variant="outline" className="text-destructive border-destructive/30">Locked</Badge>
                        : user.isActive
                          ? <Badge>Active</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                    </StatusCard>
                    <StatusCard label="Email">
                      <Badge variant={user.emailVerified ? "default" : "outline"} className={cn(!user.emailVerified && "text-muted-foreground")}>
                        {user.emailVerified ? "Verified" : "Unverified"}
                      </Badge>
                    </StatusCard>
                    <StatusCard label="Password">
                      {(() => {
                        const hasPassword = (user as any).hasPassword;
                        const profileSetupRequired = (user as any).profileSetupRequired;
                        const isPending = !hasPassword || profileSetupRequired || user.mustChangePassword;
                        return (
                          <Badge variant="outline" className={cn(isPending ? "text-muted-foreground" : "text-green-700 border-green-600/30")}>
                            {isPending ? "Pending" : "Set"}
                          </Badge>
                        );
                      })()}
                    </StatusCard>
                    <StatusCard label="Membership">
                      <span className="text-sm font-medium capitalize">{user.membershipStatus ?? "—"}</span>
                    </StatusCard>
                    <StatusCard label="Invitation" className="col-span-2 sm:col-span-2">
                      <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", invStatusClass(invStatus))}>
                        {invStatusLabel}
                      </span>
                    </StatusCard>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Key Dates</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DateRow label="Member Created" value={format(new Date(user.createdAt), "d MMM yyyy")} />
                    <DateRow
                      label="Invitation Sent"
                      value={(user as any).invitationLastSentAt
                        ? format(new Date((user as any).invitationLastSentAt), "d MMM yyyy")
                        : "Not sent yet"}
                    />
                    <DateRow
                      label="Joined"
                      value={latestInv?.acceptedAt
                        ? format(new Date(latestInv.acceptedAt), "d MMM yyyy")
                        : "Not joined yet"}
                    />
                    <DateRow
                      label="Last Login"
                      value={user.lastLoginAt
                        ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                        : "Never"}
                    />
                    {user.dateOfBirth && <DateRow label="Date of Birth" value={format(new Date(user.dateOfBirth), "d MMM yyyy")} />}
                  </div>
                </div>

                {user.roles && user.roles.length > 0 && <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Roles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((role) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}
                    </div>
                  </div>
                </>}
              </TabsContent>

              {/* ── PROFILE ── */}
              <TabsContent value="profile" className="flex-1 overflow-y-auto px-6 py-5 space-y-5 mt-0 data-[state=inactive]:hidden">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Name</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input className="h-8 text-sm" placeholder="First name"
                      value={firstNameEdit !== "" ? firstNameEdit : (user.firstName ?? "")}
                      onChange={(e) => setFirstNameEdit(e.target.value)} data-testid="input-first-name" />
                    <Input className="h-8 text-sm" placeholder="Last name"
                      value={lastNameEdit !== "" ? lastNameEdit : (user.lastName ?? "")}
                      onChange={(e) => setLastNameEdit(e.target.value)} data-testid="input-last-name" />
                  </div>
                  <Button size="sm" className="h-8 px-3 mt-2"
                    disabled={
                      updateUserName.isPending ||
                      ((firstNameEdit === "" || firstNameEdit === user.firstName) && (lastNameEdit === "" || lastNameEdit === user.lastName)) ||
                      (firstNameEdit !== "" && !firstNameEdit.trim()) || (lastNameEdit !== "" && !lastNameEdit.trim())
                    }
                    onClick={() => {
                      if (!userId) return;
                      const nf = firstNameEdit !== "" ? firstNameEdit.trim() : user.firstName;
                      const nl = lastNameEdit !== "" ? lastNameEdit.trim() : user.lastName;
                      if (!nf || !nl) return;
                      updateUserName.mutate({ id: userId, data: { firstName: nf, lastName: nl } }, {
                        onSuccess: () => { invalidate(); setFirstNameEdit(""); setLastNameEdit(""); toast({ title: "Name updated" }); },
                        onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed to update name", variant: "destructive" }),
                      });
                    }} data-testid="button-save-name">
                    {updateUserName.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Name"}
                  </Button>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Email Address</p>
                  <div className="flex gap-2">
                    <Input type="email" className="flex-1 h-8 text-sm"
                      value={emailEdit !== "" ? emailEdit : (user.email ?? "")}
                      onChange={(e) => setEmailEdit(e.target.value)} data-testid="input-email" />
                    <Button size="sm" className="h-8 px-3"
                      disabled={adminUpdateEmail.isPending || emailEdit === "" || !emailEdit.trim() || emailEdit.toLowerCase() === user.email?.toLowerCase()}
                      onClick={() => {
                        if (!userId) return;
                        const ne = emailEdit.trim();
                        if (!ne) return;
                        adminUpdateEmail.mutate({ id: userId, data: { email: ne } }, {
                          onSuccess: () => { invalidate(); setEmailEdit(""); toast({ title: "Email updated" }); },
                          onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                        });
                      }} data-testid="button-save-email">
                      {adminUpdateEmail.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Email"}
                    </Button>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Date of Birth</p>
                  <div className="flex gap-2">
                    <Input type="date" className="flex-1 h-8 text-sm"
                      value={dobEdit !== "" ? dobEdit : (user.dateOfBirth ?? "")}
                      onChange={(e) => setDobEdit(e.target.value)} data-testid="input-date-of-birth" />
                    <Button size="sm" className="h-8 px-3"
                      disabled={updateDateOfBirth.isPending || dobEdit === "" || dobEdit === (user.dateOfBirth ?? "")}
                      onClick={() => {
                        if (!userId) return;
                        updateDateOfBirth.mutate({ id: userId, data: { dateOfBirth: dobEdit || null } }, {
                          onSuccess: () => { invalidate(); setDobEdit(""); toast({ title: "Date of birth updated" }); },
                          onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                        });
                      }} data-testid="button-save-dob">
                      {updateDateOfBirth.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                    </Button>
                    {user.dateOfBirth && (
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-destructive"
                        disabled={updateDateOfBirth.isPending}
                        onClick={() => {
                          if (!userId) return;
                          updateDateOfBirth.mutate({ id: userId, data: { dateOfBirth: null } }, {
                            onSuccess: () => { invalidate(); setDobEdit(""); toast({ title: "Date of birth cleared" }); },
                            onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                          });
                        }} data-testid="button-clear-dob">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {!user.dateOfBirth && dobEdit === "" && <p className="text-xs text-muted-foreground mt-1.5">No date of birth on file.</p>}
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Membership Status</p>
                  <div className="flex gap-2">
                    <Select value={membershipStatusEdit || user.membershipStatus || "pending"} onValueChange={setMembershipStatusEdit}>
                      <SelectTrigger className="flex-1 h-8 text-sm" data-testid="select-membership-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBERSHIP_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 px-3"
                      disabled={(!membershipStatusEdit || membershipStatusEdit === user.membershipStatus) || updateMembershipStatus.isPending}
                      onClick={() => {
                        if (!userId || !membershipStatusEdit) return;
                        updateMembershipStatus.mutate({ id: userId, data: { status: membershipStatusEdit as any } }, {
                          onSuccess: () => { invalidate(); setMembershipStatusEdit(""); toast({ title: "Membership status updated" }); },
                          onError: () => toast({ title: "Failed", description: "Could not update membership status", variant: "destructive" }),
                        });
                      }} data-testid="button-save-membership-status">
                      Save
                    </Button>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Document Library Notice</p>
                  {(user as any).noticeAcceptedAt
                    ? <p className="text-sm">Accepted on {format(new Date((user as any).noticeAcceptedAt), "MMM d, yyyy 'at' h:mm a")}</p>
                    : <p className="text-sm text-muted-foreground italic">Not yet accepted</p>}
                </div>
              </TabsContent>

              {/* ── ROLES & DEGREES ── */}
              <TabsContent value="roles" className="flex-1 overflow-y-auto px-6 py-5 space-y-5 mt-0 data-[state=inactive]:hidden">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Roles</p>
                  {user.roles && user.roles.length > 0 ? (
                    <div className="space-y-1.5">
                      {user.roles.map((role) => (
                        <div key={role.id} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-sm" data-testid={`role-item-${role.id}`}>
                          <div>
                            <span className="text-sm font-medium">{role.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">L{role.permissionLevel}</span>
                          </div>
                          {(isPmSuperAdmin || role.permissionLevel < 90) && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => revokeRole.mutate({ id: userId!, roleId: role.id }, { onSuccess: () => { invalidate(); toast({ title: "Role revoked" }); } })}
                              disabled={revokeRole.isPending} data-testid={`button-revoke-role-${role.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground py-1">No roles assigned.</p>}

                  {availableRoles.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                        <SelectTrigger className="flex-1 h-8 text-sm" data-testid="select-role">
                          <SelectValue placeholder="Grant a role..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 px-3" disabled={!selectedRoleId || grantRole.isPending}
                        onClick={() => {
                          if (!userId || !selectedRoleId) return;
                          grantRole.mutate({ id: userId, data: { roleId: selectedRoleId } }, {
                            onSuccess: () => { invalidate(); setSelectedRoleId(""); toast({ title: "Role granted" }); },
                            onError: () => toast({ title: "Failed", description: "Could not grant role", variant: "destructive" }),
                          });
                        }} data-testid="button-grant-role">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Degrees</p>
                  {userDegrees.length === 0
                    ? <p className="text-sm text-muted-foreground py-1">No degree records yet.</p>
                    : (
                      <div className="space-y-1.5">
                        {userDegrees.map((d) => (
                          <div key={d.id} className="flex items-start justify-between px-3 py-2 bg-muted/30 rounded-sm">
                            <div>
                              <span className="text-sm font-medium">{d.degreeName}</span>
                              {d.conferredOn && <p className="text-xs text-muted-foreground">{format(new Date(d.conferredOn), "MMM d, yyyy")}</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => removeDegree.mutate({ id: userId!, degreeId: d.id }, { onSuccess: () => { invalidate(); toast({ title: "Degree removed" }); } })}
                              disabled={removeDegree.isPending}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                  <div className="space-y-2 mt-3 pt-3 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Add Degree</p>
                    <Select value={newDegree} onValueChange={setNewDegree}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Select degree..." /></SelectTrigger>
                      <SelectContent>
                        {degreeDefs.map((d) => <SelectItem key={d.degree} value={String(d.degree)}>{d.name} ({d.abbreviation})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={newConferredOn} onChange={(e) => setNewConferredOn(e.target.value)} className="text-sm" placeholder="Date conferred (optional)" />
                    <Button size="sm" className="w-full" disabled={!newDegree || addDegree.isPending}
                      onClick={() => {
                        if (!userId || !newDegree) return;
                        addDegree.mutate({ id: userId, data: { degree: parseInt(newDegree), conferredOn: newConferredOn || null } }, {
                          onSuccess: () => { invalidate(); setNewDegree(""); setNewConferredOn(""); toast({ title: "Degree recorded" }); },
                          onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                        });
                      }}>
                      {addDegree.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Record Degree
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ── INVITATIONS ── */}
              <TabsContent value="invitations" className="flex-1 overflow-y-auto px-6 py-5 space-y-4 mt-0 data-[state=inactive]:hidden">
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Invitation Status</p>
                      <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", invStatusClass(invStatus))}>
                        {invStatusLabel}
                      </span>
                    </div>
                    {(invStatus === "not_invited" || invStatus === "revoked" || invStatus === "expired") && (
                      <Button size="sm" onClick={() => createInvitationMutation.mutate()} disabled={createInvitationMutation.isPending} data-testid="button-create-invitation">
                        {createInvitationMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Plus className="h-3.5 w-3.5 mr-2" />}
                        Create Invitation
                      </Button>
                    )}
                  </div>

                  {invStatus === "pending" && latestInv && <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <DateRow label="Created" value={format(new Date(latestInv.createdAt), "d MMM yyyy")} />
                      <DateRow label="Expires" value={format(new Date(latestInv.expiresAt), "d MMM yyyy")} />
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline"
                        onClick={() => sendInvitationMutation.mutate(latestInv.id)}
                        disabled={sendInvitationMutation.isPending}
                        data-testid="button-send-invitation">
                        {sendInvitationMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Mail className="h-3.5 w-3.5 mr-2" />}
                        Send Invitation
                      </Button>
                      {invLinkData?.link && (
                        <Button size="sm" variant="outline"
                          onClick={() => { navigator.clipboard.writeText(invLinkData.link); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
                          data-testid="button-copy-invitation-link">
                          {copiedLink ? <Check className="h-3.5 w-3.5 mr-2 text-green-600" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                          {copiedLink ? "Copied!" : "Copy Link"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => setRevokeInvOpen(true)}
                        data-testid="button-revoke-invitation">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Revoke
                      </Button>
                    </div>
                  </>}

                  {invStatus === "accepted" && latestInv && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <DateRow label="Created" value={format(new Date(latestInv.createdAt), "d MMM yyyy")} />
                      <DateRow label="Accepted" value={latestInv.acceptedAt ? format(new Date(latestInv.acceptedAt), "d MMM yyyy") : "—"} />
                    </div>
                  )}
                </div>

                {invitations.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Past Invitations</p>
                    <div className="space-y-2">
                      {invitations.slice(1).map((inv) => {
                        const { status: s, label: l } = getInvitationStatus([inv]);
                        const invitedBy = [inv.invitedByFirstName, inv.invitedByLastName].filter(Boolean).join(" ") || inv.invitedByEmail;
                        return (
                          <div key={inv.id} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-sm text-sm">
                            <span className={cn("inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-medium", invStatusClass(s))}>{l}</span>
                            <span className="text-muted-foreground text-xs">{format(new Date(inv.createdAt), "d MMM yyyy")}</span>
                            {invitedBy && <span className="text-muted-foreground text-xs">· by {invitedBy}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── SECURITY ── */}
              <TabsContent value="security" className="flex-1 overflow-y-auto px-6 py-5 space-y-5 mt-0 data-[state=inactive]:hidden">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Access</p>
                  <div className="flex gap-2 flex-wrap">
                    {user.isActive ? (
                      <Button variant="outline" size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/5"
                        onClick={() => deactivate.mutate({ id: userId! }, { onSuccess: () => { invalidate(); toast({ title: "Account deactivated" }); } })}
                        disabled={deactivate.isPending || isSelf} data-testid="button-deactivate-user">
                        <UserX className="h-3.5 w-3.5 mr-2" /> Deactivate Account
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm"
                        onClick={() => activate.mutate({ id: userId! }, { onSuccess: () => { invalidate(); toast({ title: "Account activated" }); } })}
                        disabled={activate.isPending} data-testid="button-activate-user">
                        <UserCheck className="h-3.5 w-3.5 mr-2" /> Activate Account
                      </Button>
                    )}
                  </div>
                  {isSelf && <p className="text-xs text-muted-foreground">You cannot deactivate your own account.</p>}
                  {isLocked && <p className="text-xs text-amber-600">Account is temporarily locked due to failed login attempts.</p>}
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Password</p>
                  {user.mustChangePassword && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Member must change password at next login.
                    </p>
                  )}
                  <Button variant="outline" size="sm"
                    onClick={() => setPwdResetConfirmOpen(true)}
                    disabled={isSelf || adminResetPassword.isPending} data-testid="button-reset-password">
                    <KeyRound className="h-3.5 w-3.5 mr-2" /> Reset Password
                  </Button>
                  {isSelf && <p className="text-xs text-muted-foreground">Use Account Settings to manage your own password.</p>}
                </div>

                <Separator />

                <AdminPasskeysPanel userId={userId} onRevoked={invalidate} />
              </TabsContent>

              {/* ── TIMELINE ── */}
              <TabsContent value="timeline" className="flex-1 overflow-y-auto px-6 py-5 mt-0 data-[state=inactive]:hidden">
                {userId && <UserMemberTimeline userId={userId} userCreatedAt={user.createdAt} />}
              </TabsContent>

              {/* ── DANGER ZONE ── */}
              <TabsContent value="danger" className="flex-1 overflow-y-auto px-6 py-5 space-y-5 mt-0 data-[state=inactive]:hidden">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-destructive">Delete Member</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Permanently removes <strong>{user.firstName} {user.lastName}</strong> and all associated records including roles, degrees, passkeys, and invitations. This cannot be undone.
                      </p>
                    </div>
                  </div>

                  {!canDelete ? (
                    <div className="text-sm text-muted-foreground rounded border border-border bg-background px-3 py-2">
                      {isSelf && "You cannot delete your own account."}
                      {!isSelf && isBootstrapAdmin && "The bootstrap administrator account cannot be deleted."}
                      {!isSelf && !isBootstrapAdmin && user.roles?.some((r) => r.permissionLevel >= 90) && !isPmSuperAdmin && (
                        "Only a PM Super Administrator may delete another PM Super Administrator."
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium mb-1.5">Type <strong>{fullName}</strong> to confirm:</p>
                        <Input
                          placeholder={fullName}
                          value={deleteConfirmName}
                          onChange={(e) => setDeleteConfirmName(e.target.value)}
                          className="font-mono"
                          data-testid="input-delete-confirm-name"
                        />
                      </div>
                      <Button variant="destructive" size="sm" className="w-full"
                        disabled={!deleteNameMatches || deleteMemberMutation.isPending}
                        onClick={() => setDeleteOpen(true)} data-testid="button-delete-member">
                        {deleteMemberMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Delete Member
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* ── Dialogs ── */}

            <AlertDialog open={pwdResetConfirmOpen} onOpenChange={setPwdResetConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-amber-600" />
                    Reset Password for {user.firstName} {user.lastName}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will generate a temporary password, invalidate all active sessions, and require the member to set a new password at next login. The temporary password expires in 24 hours.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-pwd-reset">Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={adminResetPassword.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!userId) return;
                      adminResetPassword.mutate({ id: userId }, {
                        onSuccess: (result) => { setPwdResetConfirmOpen(false); setTempPasswordResult(result); setCopiedPassword(false); },
                        onError: (err: any) => { setPwdResetConfirmOpen(false); toast({ title: "Password reset failed", description: err?.data?.error ?? "Could not reset password", variant: "destructive" }); },
                      });
                    }} data-testid="button-confirm-pwd-reset">
                    {adminResetPassword.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Reset Password
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!tempPasswordResult} onOpenChange={(open) => { if (!open) setTempPasswordResult(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Temporary Password — Share Securely</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>This temporary password will <strong>not</strong> be shown again. Copy it and deliver it securely to {user.firstName} {user.lastName}. It expires at{" "}
                        {tempPasswordResult ? format(new Date(tempPasswordResult.expiresAt), "MMM d, yyyy 'at' h:mm a") : ""}.
                      </p>
                      <div className="flex items-center gap-2 rounded-sm border bg-muted px-3 py-2">
                        <code className="flex-1 font-mono text-sm font-semibold tracking-wider select-all" data-testid="temp-password-display">
                          {tempPasswordResult?.tempPassword}
                        </code>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={() => { if (!tempPasswordResult) return; navigator.clipboard.writeText(tempPasswordResult.tempPassword); setCopiedPassword(true); setTimeout(() => setCopiedPassword(false), 2000); }}
                          data-testid="button-copy-temp-password">
                          {copiedPassword ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">All sessions have been invalidated. The member must log in with this password and will be prompted to set a new one immediately.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={() => setTempPasswordResult(null)} data-testid="button-close-temp-password">
                    I've copied the password
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={revokeInvOpen} onOpenChange={setRevokeInvOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke Invitation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revoke the pending invitation for {user.firstName} {user.lastName}. They will no longer be able to use the invitation link. You can create a new invitation later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      if (!latestInv) return;
                      revokeInvitation.mutate({ id: latestInv.id }, {
                        onSuccess: () => {
                          setRevokeInvOpen(false);
                          refetchInvitations();
                          queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
                          queryClient.invalidateQueries({ queryKey: ["user-timeline", userId] });
                          toast({ title: "Invitation revoked" });
                        },
                        onError: () => toast({ title: "Could not revoke invitation", variant: "destructive" }),
                      });
                    }} data-testid="button-confirm-revoke-invitation">
                    Revoke Invitation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Delete {user.firstName} {user.lastName}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove this member and all associated records. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteMemberMutation.isPending}
                    onClick={(e) => { e.preventDefault(); deleteMemberMutation.mutate(); }}
                    data-testid="button-confirm-delete-member">
                    {deleteMemberMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Delete Member
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// --- Small helpers ---

function StatusCard({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card px-3 py-2.5", className)}>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
