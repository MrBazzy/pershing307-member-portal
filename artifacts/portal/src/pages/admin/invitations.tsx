import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListInvitations, useCreateInvitation, useRevokeInvitation, useCleanupInvitations,
  useListRoles, useGetInvitationLink, getListInvitationsQueryKey, getGetInvitationLinkQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Mail, Plus, XCircle, Loader2, Copy, AlertTriangle, Trash2 } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  roleId: z.string().optional(),
});

type Values = z.infer<typeof schema>;
type StatusFilter = "all" | "pending" | "accepted" | "revoked" | "expired";

function getInvitationStatus(inv: { acceptedAt?: string | null; revokedAt?: string | null; expiresAt: string }): "pending" | "accepted" | "revoked" | "expired" {
  if (inv.acceptedAt) return "accepted";
  if (inv.revokedAt) return "revoked";
  if (isPast(new Date(inv.expiresAt))) return "expired";
  return "pending";
}

function InvitationStatusBadge({ acceptedAt, revokedAt, expiresAt }: {
  acceptedAt?: string | null;
  revokedAt?: string | null;
  expiresAt: string;
}) {
  if (acceptedAt) return <Badge className="bg-green-100 text-green-800 border-green-200 border">Accepted</Badge>;
  if (revokedAt) return <Badge variant="outline" className="text-muted-foreground">Revoked</Badge>;
  if (isPast(new Date(expiresAt))) return <Badge variant="outline" className="text-orange-600 border-orange-200">Expired</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 border-blue-200 border">Pending</Badge>;
}

function CopyLinkButton({ invitationId }: { invitationId: string }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [copying, setCopying] = useState(false);

  const { data, isFetching } = useGetInvitationLink(invitationId, {
    query: { enabled, staleTime: 60_000, queryKey: getGetInvitationLinkQueryKey(invitationId) },
  });

  const handleClick = async () => {
    if (data?.link) {
      await navigator.clipboard.writeText(data.link);
      toast({ title: "Link copied", description: "Invitation link copied to clipboard." });
      return;
    }
    setCopying(true);
    setEnabled(true);
  };

  if (data?.link && copying) {
    navigator.clipboard.writeText(data.link).then(() => {
      toast({ title: "Link copied", description: "Invitation link copied to clipboard." });
      setCopying(false);
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={handleClick}
      disabled={isFetching}
    >
      {isFetching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      Copy Link
    </Button>
  );
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
];

export default function AdminInvitationsPage() {
  const { data, isLoading } = useListInvitations();
  const { data: rolesData } = useListRoles();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const revokeInvitation = useRevokeInvitation();
  const createInvitation = useCreateInvitation();
  const cleanupInvitations = useCleanupInvitations();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", firstName: "", lastName: "", roleId: undefined },
  });

  const smtpConfigured = data?.smtpConfigured ?? true;

  const allInvitations = data?.invitations ?? [];
  const filteredInvitations = statusFilter === "all"
    ? allInvitations
    : allInvitations.filter((inv) => getInvitationStatus(inv) === statusFilter);

  const cleanableCount = allInvitations.filter((inv) => {
    const s = getInvitationStatus(inv);
    return s === "expired" || s === "revoked";
  }).length;

  const handleRevoke = (id: string) => {
    revokeInvitation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
          toast({ title: "Invitation revoked" });
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.data?.error ?? "Could not revoke invitation", variant: "destructive" }),
      }
    );
  };

  const handleCreate = (values: Values) => {
    createInvitation.mutate(
      {
        data: {
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          roleId: values.roleId || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
          if (smtpConfigured) {
            toast({ title: "Invitation sent", description: `An invitation email has been sent to ${values.email}` });
          } else {
            toast({ title: "Invitation created", description: `Copy the invitation link to share with ${values.email}` });
          }
          form.reset();
          setShowCreateDialog(false);
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.data?.error ?? "Could not create invitation", variant: "destructive" }),
      }
    );
  };

  const handleCleanup = () => {
    cleanupInvitations.mutate(undefined, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
        setShowCleanupDialog(false);
        const n = result.removed;
        toast({
          title: "Invitations cleaned up",
          description: n === 0
            ? "No expired or revoked invitations to remove."
            : `${n} invitation${n === 1 ? "" : "s"} removed.`,
        });
      },
      onError: (e: any) => {
        setShowCleanupDialog(false);
        toast({ title: "Cleanup failed", description: e?.data?.error ?? "Could not clean up invitations", variant: "destructive" });
      },
    });
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-serif font-semibold">Invitations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage pending and past member invitations</p>
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && cleanableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCleanupDialog(true)}
                data-testid="button-cleanup-invitations"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clean Up
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-invite-member">
              <Plus className="h-4 w-4 mr-2" /> Invite Member
            </Button>
          </div>
        </div>

        {!isLoading && !smtpConfigured && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription>
              <strong>Email delivery is not configured.</strong> Invitations will be created but emails will not be sent.
              Use the <strong>Copy Link</strong> button on each pending invitation to share the link manually.
              Configure SMTP settings in <a href="/admin/config" className="underline font-medium">Admin → Configuration</a>.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-1 mb-3">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              data-testid={`filter-${f.value}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="bg-card border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-36" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  ))
                : filteredInvitations.map((inv) => {
                    const isPending = getInvitationStatus(inv) === "pending";
                    return (
                      <tr key={inv.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-invitation-${inv.id}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{inv.firstName} {inv.lastName}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{inv.email}</td>
                        <td className="px-4 py-3">
                          <InvitationStatusBadge acceptedAt={inv.acceptedAt} revokedAt={inv.revokedAt} expiresAt={inv.expiresAt} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                          {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                          {format(new Date(inv.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3">
                          {isPending && (
                            <div className="flex items-center justify-end gap-1">
                              <CopyLinkButton invitationId={inv.id} />
                              <Button
                                variant="ghost" size="sm"
                                className="text-destructive hover:bg-destructive/5 h-7 px-2 text-xs"
                                onClick={() => handleRevoke(inv.id)}
                                disabled={revokeInvitation.isPending}
                                data-testid={`button-revoke-invitation-${inv.id}`}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Revoke
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {!isLoading && filteredInvitations.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {statusFilter === "all" ? "No invitations sent yet" : `No ${statusFilter} invitations`}
              </p>
              {statusFilter === "all" && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateDialog(true)}>
                  Invite a member
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Invite a Member</DialogTitle>
            <DialogDescription>
              {smtpConfigured
                ? "An invitation email will be sent to the provided address."
                : "Email is not configured — you will need to copy and share the invitation link manually."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl><Input {...field} autoFocus data-testid="input-invite-first-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl><Input {...field} data-testid="input-invite-last-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl><Input {...field} type="email" data-testid="input-invite-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="roleId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Role <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-invite-role"><SelectValue placeholder="No role assigned" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rolesData?.roles?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={createInvitation.isPending} data-testid="button-send-invitation">
                  {createInvitation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {smtpConfigured ? "Send Invitation" : "Create Invitation"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean Up Invitations</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all expired and revoked invitations.
              Pending and accepted invitations will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupInvitations.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCleanup(); }}
              disabled={cleanupInvitations.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cleanup"
            >
              {cleanupInvitations.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove Invitations
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
