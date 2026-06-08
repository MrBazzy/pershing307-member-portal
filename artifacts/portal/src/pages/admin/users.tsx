import { useState } from "react";
import { useListUsers, useListRoles, useGetUser, useDeactivateUser, useActivateUser, useGrantUserRole, useRevokeUserRole, getListUsersQueryKey, getGetUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { Users, UserX, UserCheck, Shield, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export default function AdminUsersPage() {
  const { data, isLoading } = useListUsers();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-semibold">Members</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data?.users ? `${data.users.length} member${data.users.length !== 1 ? "s" : ""}` : "Loading..."}
            </p>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                : data?.users?.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedUserId(user.id)}
                      data-testid={`row-user-${user.id}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {user.firstName} {user.lastName}
                        </p>
                        {user.membershipStatus && (
                          <p className="text-[11px] text-muted-foreground">{user.membershipStatus}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={user.isActive ? "default" : "outline"}
                          className={cn(!user.isActive && "text-muted-foreground")}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {user.lastLoginAt
                          ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                          : "Never"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {format(new Date(user.createdAt), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!isLoading && data?.users?.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No members yet</p>
            </div>
          )}
        </div>
      </div>

      <UserDetailSheet
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </AppLayout>
  );
}

function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const { data, isLoading } = useGetUser(userId ?? "", {
    query: { enabled: !!userId, queryKey: getGetUserQueryKey(userId ?? "") },
  });

  const { data: rolesData } = useListRoles();
  const deactivate = useDeactivateUser();
  const activate = useActivateUser();
  const grantRole = useGrantUserRole();
  const revokeRole = useRevokeUserRole();

  const user = data?.user;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    if (userId) queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
  };

  const handleDeactivate = () => {
    if (!userId) return;
    deactivate.mutate(
      { id: userId },
      {
        onSuccess: () => { invalidate(); toast({ title: "User deactivated" }); },
        onError: (e: any) => toast({ title: "Failed", description: e?.data?.error ?? "Could not deactivate user", variant: "destructive" }),
      }
    );
  };

  const handleActivate = () => {
    if (!userId) return;
    activate.mutate(
      { id: userId },
      {
        onSuccess: () => { invalidate(); toast({ title: "User activated" }); },
        onError: () => toast({ title: "Failed", description: "Could not activate user", variant: "destructive" }),
      }
    );
  };

  const handleGrantRole = () => {
    if (!userId || !selectedRoleId) return;
    grantRole.mutate(
      { id: userId, data: { roleId: selectedRoleId } },
      {
        onSuccess: () => {
          invalidate();
          setSelectedRoleId("");
          toast({ title: "Role granted" });
        },
        onError: () => toast({ title: "Failed", description: "Could not grant role", variant: "destructive" }),
      }
    );
  };

  const handleRevokeRole = (roleId: string) => {
    if (!userId) return;
    revokeRole.mutate(
      { id: userId, roleId },
      {
        onSuccess: () => { invalidate(); toast({ title: "Role revoked" }); },
        onError: () => toast({ title: "Failed", description: "Could not revoke role", variant: "destructive" }),
      }
    );
  };

  const currentRoleIds = new Set(user?.roles?.map((r) => r.id));
  const availableRoles = rolesData?.roles?.filter((r) => !currentRoleIds.has(r.id)) ?? [];

  return (
    <Sheet open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {isLoading || !user ? (
          <div className="space-y-3 pt-8">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="font-serif">
                {user.firstName} {user.lastName}
              </SheetTitle>
              <SheetDescription>{user.email}</SheetDescription>
            </SheetHeader>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailItem label="Status">
                  <Badge variant={user.isActive ? "default" : "outline"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </DetailItem>
                <DetailItem label="Email Verified">
                  <Badge variant={user.emailVerified ? "default" : "outline"}>
                    {user.emailVerified ? "Verified" : "Pending"}
                  </Badge>
                </DetailItem>
                {user.membershipStatus && (
                  <DetailItem label="Membership">{user.membershipStatus}</DetailItem>
                )}
                <DetailItem label="Joined">{format(new Date(user.createdAt), "MMM d, yyyy")}</DetailItem>
                <DetailItem label="Last Login">
                  {user.lastLoginAt
                    ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                    : "Never"}
                </DetailItem>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Roles</p>
                {user.roles && user.roles.length > 0 ? (
                  <div className="space-y-1.5">
                    {user.roles.map((role) => (
                      <div
                        key={role.id}
                        className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-sm"
                        data-testid={`role-item-${role.id}`}
                      >
                        <div>
                          <span className="text-sm font-medium">{role.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">L{role.permissionLevel}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRevokeRole(role.id)}
                          disabled={revokeRole.isPending}
                          data-testid={`button-revoke-role-${role.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No roles assigned</p>
                )}

                {availableRoles.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger className="flex-1 h-8 text-xs" data-testid="select-role">
                        <SelectValue placeholder="Grant a role..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 px-3"
                      onClick={handleGrantRole}
                      disabled={!selectedRoleId || grantRole.isPending}
                      data-testid="button-grant-role"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex gap-2">
                {user.isActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={handleDeactivate}
                    disabled={deactivate.isPending}
                    data-testid="button-deactivate-user"
                  >
                    <UserX className="h-3.5 w-3.5 mr-2" />
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleActivate}
                    disabled={activate.isPending}
                    data-testid="button-activate-user"
                  >
                    <UserCheck className="h-3.5 w-3.5 mr-2" />
                    Activate
                  </Button>
                )}
              </div>
            </div>
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
