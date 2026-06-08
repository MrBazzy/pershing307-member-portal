import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  useListUsers,
  useGetUserDegrees,
  useAddUserDegree,
  useRemoveUserDegree,
  useListDegreeDefinitions,
  getGetUserDegreesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Trash2, Search, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";

const addSchema = z.object({
  degree: z.string().min(1, "Degree is required"),
  conferredOn: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type AddValues = z.infer<typeof addSchema>;

export default function AdminDegreesPage() {
  const { data: defsData } = useListDegreeDefinitions();
  const { data: usersData, isLoading: usersLoading } = useListUsers({ limit: 200, offset: 0 });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const definitions = defsData?.definitions ?? [
    { degree: 1, name: "Entered Apprentice", abbreviation: "EA" },
    { degree: 2, name: "Fellow Craft", abbreviation: "FC" },
    { degree: 3, name: "Master Mason", abbreviation: "MM" },
    { degree: 4, name: "Past Master", abbreviation: "PM" },
  ];

  const { data: degreesData, isLoading: degreesLoading } = useGetUserDegrees(selectedUserId ?? "skip", {
    query: { enabled: !!selectedUserId, queryKey: getGetUserDegreesQueryKey(selectedUserId ?? "skip") },
  });

  const addMutation = useAddUserDegree();
  const removeMutation = useRemoveUserDegree();

  const form = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: { degree: "", conferredOn: "", notes: "" },
  });

  const users = (usersData?.users ?? []).filter(
    (u) =>
      !search.trim() ||
      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUser = usersData?.users?.find((u) => u.id === selectedUserId);
  const degrees = degreesData?.degrees ?? [];

  const handleAdd = (values: AddValues) => {
    if (!selectedUserId) return;
    addMutation.mutate(
      {
        id: selectedUserId,
        data: {
          degree: parseInt(values.degree),
          conferredOn: values.conferredOn || null,
          notes: values.notes || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserDegreesQueryKey(selectedUserId) });
          toast({ title: "Degree recorded" });
          form.reset();
          setShowAdd(false);
        },
        onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed to add degree", variant: "destructive" }),
      }
    );
  };

  const handleRemove = (degreeId: string) => {
    if (!selectedUserId) return;
    removeMutation.mutate(
      { id: selectedUserId, degreeId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserDegreesQueryKey(selectedUserId) });
          toast({ title: "Degree record removed" });
        },
        onError: (e: any) => toast({ title: "Error", description: e?.data?.error ?? "Failed to remove", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6" /> Degree Records
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign and view Masonic degree conferral records for members.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search members..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              {usersLoading ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : users.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No members found</div>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    className={`w-full text-left px-3 py-3 border-b last:border-b-0 transition-colors hover:bg-muted/50 ${
                      selectedUserId === u.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            {!selectedUserId ? (
              <div className="border rounded-lg flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center space-y-2">
                  <GraduationCap className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm">Select a member to view their degree records.</p>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                  <div>
                    <p className="font-medium text-sm">{selectedUser?.firstName} {selectedUser?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser?.email}</p>
                  </div>
                  <Button size="sm" onClick={() => setShowAdd(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Degree
                  </Button>
                </div>

                {degreesLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
                  </div>
                ) : degrees.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No degree records yet.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {degrees.map((d) => (
                      <div key={d.id} className="flex items-start justify-between px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{d.degreeName}</span>
                            <Badge variant="secondary" className="text-xs">Degree {d.degree}</Badge>
                          </div>
                          {d.conferredOn && (
                            <p className="text-xs text-muted-foreground">
                              Conferred: {format(new Date(d.conferredOn), "MMMM d, yyyy")}
                            </p>
                          )}
                          {d.notes && <p className="text-xs text-muted-foreground italic">{d.notes}</p>}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleRemove(d.id)}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Degree Record</DialogTitle>
              <DialogDescription>
                Record a Masonic degree for {selectedUser?.firstName} {selectedUser?.lastName}.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleAdd)} className="space-y-4">
                <FormField control={form.control} name="degree" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Degree</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select degree..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {definitions.map((d) => (
                          <SelectItem key={d.degree} value={String(d.degree)}>
                            {d.name} ({d.abbreviation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="conferredOn" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date Conferred <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Conferred at Stated Communication" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                  <Button type="submit" disabled={addMutation.isPending}>
                    {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Record Degree
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
