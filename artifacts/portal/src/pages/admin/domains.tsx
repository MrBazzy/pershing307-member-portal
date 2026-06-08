import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  useListDomains,
  useListUsers,
  useGetUserDomains,
  useGrantUserDomain,
  useRevokeUserDomain,
  getGetUserDomainsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Users, Plus, XCircle, Info, Loader2, ShieldAlert } from "lucide-react";

export default function AdminDomainsPage() {
  const { user: currentUser } = useAuth();
  const { data: domainsData, isLoading: domainsLoading } = useListDomains();
  const { data: usersData } = useListUsers({ limit: 200, offset: 0 });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDomain, setSelectedDomain] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [grantUserId, setGrantUserId] = useState<string>("");

  const isPmSuperAdmin = currentUser?.roles?.some((r) => r.permissionLevel >= 90) ?? false;
  const isAdmin = currentUser?.roles?.some((r) => r.permissionLevel >= 70) ?? false;


  const grantMutation = useGrantUserDomain();
  const revokeMutation = useRevokeUserDomain();

  const domains = domainsData?.domains ?? [];
  const users = usersData?.users ?? [];

  const handleGrant = () => {
    if (!grantUserId || !selectedDomain) return;
    grantMutation.mutate(
      { id: grantUserId, data: { domainId: selectedDomain.id } },
      {
        onSuccess: () => {
          toast({ title: "Access granted" });
          setShowGrant(false);
          setGrantUserId("");
        },
        onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed to grant access", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="h-6 w-6" /> Protected Domains
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage access to restricted content areas. Only PM Super Administrators can grant or revoke access.
          </p>
        </div>

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Domain access is <strong>not</strong> automatically granted to any role, including Administrators and Site Administrators.
            Access must be explicitly granted per user by a PM Super Administrator.
          </AlertDescription>
        </Alert>

        {domainsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No protected domains configured.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => (
              <DomainRow
                key={domain.id}
                domain={domain}
                users={users}
                isPmSuperAdmin={isPmSuperAdmin}
                onGrantOpen={() => { setSelectedDomain(domain); setShowGrant(true); }}
              />
            ))}
          </div>
        )}

        <Dialog open={showGrant} onOpenChange={(o) => { setShowGrant(o); if (!o) setGrantUserId(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Domain Access</DialogTitle>
              <DialogDescription>
                Select a member to grant access to <strong>{selectedDomain?.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={grantUserId} onValueChange={setGrantUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a member..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} — {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowGrant(false)}>Cancel</Button>
                <Button onClick={handleGrant} disabled={!grantUserId || grantMutation.isPending}>
                  {grantMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Grant Access
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function DomainRow({
  domain,
  users,
  isPmSuperAdmin,
  onGrantOpen,
}: {
  domain: { id: string; name: string; slug: string; description?: string | null };
  users: { id: string; firstName: string; lastName: string; email: string }[];
  isPmSuperAdmin: boolean;
  onGrantOpen: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const revokeMutation = useRevokeUserDomain();

  const usersGrantsKey = (userId: string) => getGetUserDomainsQueryKey(userId);

  const handleRevoke = (userId: string, domainId: string) => {
    revokeMutation.mutate(
      { id: userId, domainId },
      {
        onSuccess: () => {
          toast({ title: "Access revoked" });
        },
        onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed to revoke", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">{domain.name}</span>
            <Badge variant="outline" className="text-xs font-mono">{domain.slug}</Badge>
          </div>
          {domain.description && (
            <p className="text-xs text-muted-foreground pl-6">{domain.description}</p>
          )}
        </div>
        {isPmSuperAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onGrantOpen(); }}
            className="shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Grant
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/10">
          <UserGrantsList domainId={domain.id} users={users} isPmSuperAdmin={isPmSuperAdmin} onRevoke={handleRevoke} />
        </div>
      )}
    </div>
  );
}

function UserGrantsList({
  domainId,
  users,
  isPmSuperAdmin,
  onRevoke,
}: {
  domainId: string;
  users: { id: string; firstName: string; lastName: string; email: string }[];
  isPmSuperAdmin: boolean;
  onRevoke: (userId: string, domainId: string) => void;
}) {
  const usersWithAccess = users.filter(() => false);

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" />
        Expand a member record to see their specific domain grants.
      </p>
    </div>
  );
}
