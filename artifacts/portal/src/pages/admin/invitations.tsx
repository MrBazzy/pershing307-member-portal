import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useListInvitations, useCreateInvitation, useRevokeInvitation, useListRoles, getListInvitationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Mail, Plus, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  roleId: z.string().optional(),
});

type Values = z.infer<typeof schema>;

function InvitationStatusBadge({ acceptedAt, revokedAt, expiresAt }: { acceptedAt?: string | null; revokedAt?: string | null; expiresAt: string }) {
  if (acceptedAt) return <Badge className="bg-green-100 text-green-800 border-green-200 border">Accepted</Badge>;
  if (revokedAt) return <Badge variant="outline" className="text-muted-foreground">Revoked</Badge>;
  if (isPast(new Date(expiresAt))) return <Badge variant="outline" className="text-orange-600 border-orange-200">Expired</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 border-blue-200 border">Pending</Badge>;
}

export default function AdminInvitationsPage() {
  const { data, isLoading } = useListInvitations();
  const { data: rolesData } = useListRoles();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const revokeInvitation = useRevokeInvitation();
  const createInvitation = useCreateInvitation();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", firstName: "", lastName: "", roleId: undefined },
  });

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
          toast({ title: "Invitation sent", description: `An invitation has been sent to ${values.email}` });
          form.reset();
          setShowCreateDialog(false);
        },
        onError: (e: any) => toast({ title: "Failed", description: e?.data?.error ?? "Could not create invitation", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-semibold">Invitations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage pending and past member invitations
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-invite-member">
            <Plus className="h-4 w-4 mr-2" /> Invite Member
          </Button>
        </div>

        <div className="bg-card border border-card-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                : data?.invitations?.map((inv) => {
                    const isPending = !inv.acceptedAt && !inv.revokedAt && !isPast(new Date(inv.expiresAt));
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
                        <td className="px-4 py-3 text-right">
                          {isPending && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/5 h-7 px-2 text-xs"
                              onClick={() => handleRevoke(inv.id)}
                              disabled={revokeInvitation.isPending}
                              data-testid={`button-revoke-invitation-${inv.id}`}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!isLoading && data?.invitations?.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No invitations sent yet</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateDialog(true)}>
                Invite a member
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Invite a Member</DialogTitle>
            <DialogDescription>
              An invitation email will be sent to the provided address.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} autoFocus data-testid="input-invite-first-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-invite-last-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" data-testid="input-invite-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="roleId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Role <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger data-testid="select-invite-role">
                        <SelectValue placeholder="No role assigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rolesData?.roles?.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={createInvitation.isPending} data-testid="button-send-invitation">
                  {createInvitation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Send Invitation
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
