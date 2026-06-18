import { useState, useCallback, useEffect } from "react";
import {
  useListUsers, useListRoles, useGetUser, useDeactivateUser, useActivateUser,
  useGrantUserRole, useRevokeUserRole, useGetUserDomains, useGetUserDegrees,
  useGrantUserDomain, useRevokeUserDomain, useListDomains, useListDegreeDefinitions,
  useAddUserDegree, useRemoveUserDegree, useResetTestUser,
  useUpdateUserMembershipStatus, useFixMembership, useAdminResetPassword,
  useUpdateDateOfBirth, useUpdateUserName,
  getListUsersQueryKey, getGetUserQueryKey, getGetUserDomainsQueryKey, getGetUserDegreesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow, format } from "date-fns";
import {
  Users, UserX, UserCheck, Plus, Trash2, Search, ChevronLeft, ChevronRight, Loader2,
  AlertTriangle, KeyRound, Copy, Check, Cake,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [fixConfirmOpen, setFixConfirmOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fixMembership = useFixMembership();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => {
      setDebouncedSearch(value);
      setOffset(0);
    }, 300);
  };

  const { data, isLoading } = useListUsers({
    limit: PAGE_SIZE,
    offset,
    search: debouncedSearch || undefined,
  });

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
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name or email..."
              value={search}
              onChange={handleSearchChange}
              data-testid="input-search-users"
            />
          </div>
        </div>

        {stuckCount > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-sm border border-amber-500/40 bg-amber-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                {stuckCount} active {stuckCount === 1 ? "member has" : "members have"} pending membership status
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                These accounts have portal access but their membership status was not set automatically.
              </p>
            </div>
            <Button
              variant="outline" size="sm"
              className="shrink-0 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              onClick={() => setFixConfirmOpen(true)}
              data-testid="button-fix-membership"
            >
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
                    <tr
                      key={user.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedUserId(user.id)}
                      data-testid={`row-user-${user.id}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{user.firstName} {user.lastName}</p>
                        {user.membershipStatus && (
                          <p className="text-[11px] text-muted-foreground">{user.membershipStatus}</p>
                        )}
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
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UserDetailSheet userId={selectedUserId} onClose={() => setSelectedUserId(null)} />

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

function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [tab, setTab] = useState("info");
  const [newDegree, setNewDegree] = useState("");
  const [newConferredOn, setNewConferredOn] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [membershipStatusEdit, setMembershipStatusEdit] = useState("");
  const [dobEdit, setDobEdit] = useState<string>("");
  const [firstNameEdit, setFirstNameEdit] = useState("");
  const [lastNameEdit, setLastNameEdit] = useState("");
  const [pwdResetConfirmOpen, setPwdResetConfirmOpen] = useState(false);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ tempPassword: string; expiresAt: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  useEffect(() => { setMembershipStatusEdit(""); setDobEdit(""); setFirstNameEdit(""); setLastNameEdit(""); }, [userId]);

  const { data, isLoading } = useGetUser(userId ?? "", {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId ?? "") },
  });
  const { data: rolesData } = useListRoles();
  const { data: domainsAllData } = useListDomains();
  const { data: degreeDefsData } = useListDegreeDefinitions();
  const { data: userDomainsData } = useGetUserDomains(userId ?? "", { query: { enabled: !!userId && tab === "domains", queryKey: getGetUserDomainsQueryKey(userId ?? "") } });
  const { data: userDegreesData } = useGetUserDegrees(userId ?? "", { query: { enabled: !!userId && tab === "degrees", queryKey: getGetUserDegreesQueryKey(userId ?? "") } });

  const deactivate = useDeactivateUser();
  const activate = useActivateUser();
  const updateMembershipStatus = useUpdateUserMembershipStatus();
  const grantRole = useGrantUserRole();
  const revokeRole = useRevokeUserRole();
  const grantDomain = useGrantUserDomain();
  const revokeDomain = useRevokeUserDomain();
  const addDegree = useAddUserDegree();
  const removeDegree = useRemoveUserDegree();
  const resetTestUser = useResetTestUser();
  const adminResetPassword = useAdminResetPassword();
  const updateDateOfBirth = useUpdateDateOfBirth();
  const updateUserName = useUpdateUserName();

  const isPmSuperAdmin = currentUser?.roles?.some((r) => r.permissionLevel >= 90) ?? false;

  const user = data?.user;
  const testResetEnabled = data?.testResetEnabled ?? false;
  const isSelf = !!user && user.id === currentUser?.id;
  const canResetTestUser = testResetEnabled && isPmSuperAdmin && !isSelf;
  const allDomains = domainsAllData?.domains ?? [];
  const userDomains = userDomainsData?.domains ?? [];
  const userDegrees = userDegreesData?.degrees ?? [];
  const degreeDefs = degreeDefsData?.definitions ?? [
    { degree: 1, name: "Entered Apprentice", abbreviation: "EA" },
    { degree: 2, name: "Fellow Craft", abbreviation: "FC" },
    { degree: 3, name: "Master Mason", abbreviation: "MM" },
  ];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    if (userId) {
      queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
      queryClient.invalidateQueries({ queryKey: getGetUserDomainsQueryKey(userId) });
      queryClient.invalidateQueries({ queryKey: getGetUserDegreesQueryKey(userId) });
    }
  };

  const currentRoleIds = new Set(user?.roles?.map((r) => r.id));
  const availableRoles = rolesData?.roles?.filter(
    (r) => !currentRoleIds.has(r.id) && (isPmSuperAdmin || r.permissionLevel < 90)
  ) ?? [];
  const grantedDomainIds = new Set(userDomains.map((d) => d.domainId));
  const availableDomains = allDomains.filter((d) => !grantedDomainIds.has(d.id));

  return (
    <Sheet open={!!userId} onOpenChange={(open) => { if (!open) { onClose(); setTab("info"); } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {isLoading || !user ? (
          <div className="space-y-3 pt-8">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="font-serif">{user.firstName} {user.lastName}</SheetTitle>
              <SheetDescription>{user.email}</SheetDescription>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                <TabsTrigger value="domains" className="flex-1">Domains</TabsTrigger>
                <TabsTrigger value="degrees" className="flex-1">Degrees</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-5 pt-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailItem label="Status">
                    <Badge variant={user.isActive ? "default" : "outline"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                  </DetailItem>
                  <DetailItem label="Email">
                    <Badge variant={user.emailVerified ? "default" : "outline"}>{user.emailVerified ? "Verified" : "Pending"}</Badge>
                  </DetailItem>
                  <DetailItem label="Joined">{format(new Date(user.createdAt), "MMM d, yyyy")}</DetailItem>
                  <DetailItem label="Last Login">
                    {user.lastLoginAt ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true }) : "Never"}
                  </DetailItem>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Name</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="First name"
                      value={firstNameEdit !== "" ? firstNameEdit : (user.firstName ?? "")}
                      onChange={(e) => setFirstNameEdit(e.target.value)}
                      data-testid="input-first-name"
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Last name"
                      value={lastNameEdit !== "" ? lastNameEdit : (user.lastName ?? "")}
                      onChange={(e) => setLastNameEdit(e.target.value)}
                      data-testid="input-last-name"
                    />
                  </div>
                  <Button
                    size="sm" className="h-8 px-3 mt-2"
                    disabled={
                      updateUserName.isPending ||
                      (
                        (firstNameEdit === "" || firstNameEdit === user.firstName) &&
                        (lastNameEdit === "" || lastNameEdit === user.lastName)
                      ) ||
                      (firstNameEdit !== "" && firstNameEdit.trim() === "") ||
                      (lastNameEdit !== "" && lastNameEdit.trim() === "")
                    }
                    onClick={() => {
                      if (!userId) return;
                      const newFirst = firstNameEdit !== "" ? firstNameEdit.trim() : user.firstName;
                      const newLast = lastNameEdit !== "" ? lastNameEdit.trim() : user.lastName;
                      if (!newFirst || !newLast) return;
                      updateUserName.mutate(
                        { id: userId, data: { firstName: newFirst, lastName: newLast } },
                        {
                          onSuccess: () => {
                            invalidate();
                            setFirstNameEdit("");
                            setLastNameEdit("");
                            toast({ title: "Name updated" });
                          },
                          onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed to update name", variant: "destructive" }),
                        }
                      );
                    }}
                    data-testid="button-save-name"
                  >
                    {updateUserName.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Name"}
                  </Button>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Date of Birth</p>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="date"
                      className="flex-1 h-8 text-xs"
                      value={dobEdit !== "" ? dobEdit : (user.dateOfBirth ?? "")}
                      onChange={(e) => setDobEdit(e.target.value)}
                      data-testid="input-date-of-birth"
                    />
                    <Button
                      size="sm" className="h-8 px-3"
                      disabled={
                        updateDateOfBirth.isPending ||
                        (dobEdit === "" || dobEdit === (user.dateOfBirth ?? ""))
                      }
                      onClick={() => {
                        if (!userId) return;
                        updateDateOfBirth.mutate(
                          { id: userId, data: { dateOfBirth: dobEdit || null } },
                          {
                            onSuccess: () => {
                              invalidate();
                              setDobEdit("");
                              toast({ title: "Date of birth updated" });
                            },
                            onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                          }
                        );
                      }}
                      data-testid="button-save-dob"
                    >
                      {updateDateOfBirth.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                    </Button>
                    {(user.dateOfBirth) && (
                      <Button
                        size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-destructive"
                        disabled={updateDateOfBirth.isPending}
                        onClick={() => {
                          if (!userId) return;
                          updateDateOfBirth.mutate(
                            { id: userId, data: { dateOfBirth: null } },
                            {
                              onSuccess: () => {
                                invalidate();
                                setDobEdit("");
                                toast({ title: "Date of birth cleared" });
                              },
                              onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                            }
                          );
                        }}
                        data-testid="button-clear-dob"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {!user.dateOfBirth && dobEdit === "" && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">No date of birth on file.</p>
                  )}
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Membership Status</p>
                  <div className="flex gap-2">
                    <Select
                      value={membershipStatusEdit || user.membershipStatus || "pending"}
                      onValueChange={setMembershipStatusEdit}
                    >
                      <SelectTrigger className="flex-1 h-8 text-xs" data-testid="select-membership-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm" className="h-8 px-3"
                      disabled={
                        (!membershipStatusEdit || membershipStatusEdit === user.membershipStatus) ||
                        updateMembershipStatus.isPending
                      }
                      onClick={() => {
                        if (!userId || !membershipStatusEdit) return;
                        updateMembershipStatus.mutate(
                          { id: userId, data: { status: membershipStatusEdit as "pending" | "active" | "inactive" | "suspended" } },
                          {
                            onSuccess: () => {
                              invalidate();
                              setMembershipStatusEdit("");
                              toast({ title: "Membership status updated" });
                            },
                            onError: () => toast({ title: "Failed", description: "Could not update membership status", variant: "destructive" }),
                          },
                        );
                      }}
                      data-testid="button-save-membership-status"
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <Separator />

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
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => revokeRole.mutate({ id: userId!, roleId: role.id }, { onSuccess: () => { invalidate(); toast({ title: "Role revoked" }); } })}
                              disabled={revokeRole.isPending}
                              data-testid={`button-revoke-role-${role.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-muted-foreground py-2">No roles assigned</p>}

                  {availableRoles.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                        <SelectTrigger className="flex-1 h-8 text-xs" data-testid="select-role">
                          <SelectValue placeholder="Grant a role..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm" className="h-8 px-3"
                        onClick={() => {
                          if (!userId || !selectedRoleId) return;
                          grantRole.mutate({ id: userId, data: { roleId: selectedRoleId } }, {
                            onSuccess: () => { invalidate(); setSelectedRoleId(""); toast({ title: "Role granted" }); },
                            onError: () => toast({ title: "Failed", description: "Could not grant role", variant: "destructive" }),
                          });
                        }}
                        disabled={!selectedRoleId || grantRole.isPending}
                        data-testid="button-grant-role"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Security</p>
                  <Button
                    variant="outline" size="sm" className="w-full"
                    onClick={() => setPwdResetConfirmOpen(true)}
                    disabled={isSelf || adminResetPassword.isPending}
                    data-testid="button-reset-password"
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-2" /> Reset Password
                  </Button>
                  {isSelf && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">You cannot reset your own password here. Use Account Settings.</p>
                  )}
                </div>

                <Separator />

                <div className="flex gap-2">
                  {user.isActive ? (
                    <Button
                      variant="outline" size="sm"
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => deactivate.mutate({ id: userId! }, { onSuccess: () => { invalidate(); toast({ title: "User deactivated" }); } })}
                      disabled={deactivate.isPending}
                      data-testid="button-deactivate-user"
                    >
                      <UserX className="h-3.5 w-3.5 mr-2" /> Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="outline" size="sm" className="flex-1"
                      onClick={() => activate.mutate({ id: userId! }, { onSuccess: () => { invalidate(); toast({ title: "User activated" }); } })}
                      disabled={activate.isPending}
                      data-testid="button-activate-user"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-2" /> Activate
                    </Button>
                  )}
                </div>

                {canResetTestUser && (
                  <>
                    <Separator />
                    <div className="rounded-sm border border-amber-500/40 bg-amber-500/5 p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-500">Testing Tools</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Permanently removes this test user and frees the email address for re-invitation. Available in test environments only.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline" size="sm"
                        className="w-full text-destructive border-destructive/40 hover:bg-destructive/5"
                        onClick={() => setResetConfirmOpen(true)}
                        disabled={resetTestUser.isPending}
                        data-testid="button-reset-test-user"
                      >
                        {resetTestUser.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-2" />}
                        Remove Test User
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="domains" className="space-y-4 pt-4">
                {userDomains.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3">No domain access granted.</p>
                ) : (
                  <div className="space-y-1.5">
                    {userDomains.map((d) => (
                      <div key={d.domainId} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-sm">
                        <div>
                          <span className="text-sm font-medium">{d.domainName}</span>
                          <span className="text-xs text-muted-foreground font-mono ml-2">{d.domainSlug}</span>
                        </div>
                        {isPmSuperAdmin && (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => revokeDomain.mutate({ id: userId!, domainId: d.domainId }, { onSuccess: () => { invalidate(); toast({ title: "Domain access revoked" }); } })}
                            disabled={revokeDomain.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isPmSuperAdmin && availableDomains.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Grant access to:</p>
                    <div className="space-y-1">
                      {availableDomains.map((d) => (
                        <div key={d.id} className="flex items-center justify-between px-3 py-2 border rounded-sm">
                          <span className="text-sm">{d.name}</span>
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => grantDomain.mutate({ id: userId!, data: { domainId: d.id } }, { onSuccess: () => { invalidate(); toast({ title: "Domain access granted" }); } })}
                            disabled={grantDomain.isPending}
                          >
                            Grant
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isPmSuperAdmin && (
                  <p className="text-xs text-muted-foreground italic">Only PM Super Administrators can modify domain access.</p>
                )}
              </TabsContent>

              <TabsContent value="degrees" className="space-y-4 pt-4">
                {userDegrees.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3">No degree records yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {userDegrees.map((d) => (
                      <div key={d.id} className="flex items-start justify-between px-3 py-2 bg-muted/30 rounded-sm">
                        <div>
                          <span className="text-sm font-medium">{d.degreeName}</span>
                          {d.conferredOn && <p className="text-xs text-muted-foreground">{format(new Date(d.conferredOn), "MMM d, yyyy")}</p>}
                          {d.notes && <p className="text-xs text-muted-foreground italic">{d.notes}</p>}
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeDegree.mutate({ id: userId!, degreeId: d.id }, { onSuccess: () => { invalidate(); toast({ title: "Degree removed" }); } })}
                          disabled={removeDegree.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Degree</p>
                  <Select value={newDegree} onValueChange={setNewDegree}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Select degree..." /></SelectTrigger>
                    <SelectContent>
                      {degreeDefs.map((d) => (
                        <SelectItem key={d.degree} value={String(d.degree)}>{d.name} ({d.abbreviation})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={newConferredOn}
                    onChange={(e) => setNewConferredOn(e.target.value)}
                    className="text-sm"
                    placeholder="Date conferred (optional)"
                  />
                  <Button
                    size="sm" className="w-full"
                    onClick={() => {
                      if (!userId || !newDegree) return;
                      addDegree.mutate(
                        { id: userId, data: { degree: parseInt(newDegree), conferredOn: newConferredOn || null } },
                        {
                          onSuccess: () => {
                            invalidate();
                            setNewDegree("");
                            setNewConferredOn("");
                            toast({ title: "Degree recorded" });
                          },
                          onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed", variant: "destructive" }),
                        }
                      );
                    }}
                    disabled={!newDegree || addDegree.isPending}
                  >
                    {addDegree.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Record Degree
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Remove Test User
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This is a testing-only action. It permanently removes this test user
                    and allows the email address to be reused. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-reset">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      if (!userId) return;
                      resetTestUser.mutate({ id: userId }, {
                        onSuccess: () => {
                          setResetConfirmOpen(false);
                          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
                          toast({ title: "Test user removed", description: "The email address can now be invited again." });
                          onClose();
                          setTab("info");
                        },
                        onError: (e: any) => {
                          setResetConfirmOpen(false);
                          toast({ title: "Could not remove user", description: e?.data?.error ?? "Action failed", variant: "destructive" });
                        },
                      });
                    }}
                    data-testid="button-confirm-reset"
                  >
                    Remove Test User
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

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
                  <AlertDialogAction
                    disabled={adminResetPassword.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!userId) return;
                      adminResetPassword.mutate({ id: userId }, {
                        onSuccess: (result) => {
                          setPwdResetConfirmOpen(false);
                          setTempPasswordResult(result);
                          setCopiedPassword(false);
                        },
                        onError: (err: any) => {
                          setPwdResetConfirmOpen(false);
                          toast({
                            title: "Password reset failed",
                            description: err?.data?.error ?? "Could not reset password",
                            variant: "destructive",
                          });
                        },
                      });
                    }}
                    data-testid="button-confirm-pwd-reset"
                  >
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
                      <p>
                        This temporary password will <strong>not</strong> be shown again.
                        Copy it now and deliver it securely to {user.firstName} {user.lastName}.
                        It expires at{" "}
                        {tempPasswordResult ? format(new Date(tempPasswordResult.expiresAt), "MMM d, yyyy 'at' h:mm a") : ""}.
                      </p>
                      <div className="flex items-center gap-2 rounded-sm border bg-muted px-3 py-2">
                        <code className="flex-1 font-mono text-sm font-semibold tracking-wider select-all" data-testid="temp-password-display">
                          {tempPasswordResult?.tempPassword}
                        </code>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={() => {
                            if (!tempPasswordResult) return;
                            navigator.clipboard.writeText(tempPasswordResult.tempPassword);
                            setCopiedPassword(true);
                            setTimeout(() => setCopiedPassword(false), 2000);
                          }}
                          data-testid="button-copy-temp-password"
                        >
                          {copiedPassword ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The member's existing sessions have been invalidated. They must use this password to log in and will be prompted to create a new one immediately.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction
                    onClick={() => setTempPasswordResult(null)}
                    data-testid="button-close-temp-password"
                  >
                    I've copied the password
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

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}
