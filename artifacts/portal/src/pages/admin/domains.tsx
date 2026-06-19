import { useState } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDocumentDomains,
  useCreateDocumentDomain,
  useUpdateDocumentDomain,
  useUpdateDocumentDomainAccess,
  useDeleteDocumentDomain,
  getListDocumentDomainsQueryKey,
  type DocumentDomainItem,
  type DocumentDomainAccessUpdateInputAccessLogic,
} from "@workspace/api-client-react";
import { Shield, Plus, MoreHorizontal, Pencil, Trash2, Settings2, AlertCircle } from "lucide-react";
import { ADMIN_LEVEL, PM_SUPER_LEVEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ACCESS_LOGIC_OPTIONS = [
  { value: "role_only", label: "Role Only" },
  { value: "degree_only", label: "Degree Only" },
  { value: "role_or_degree", label: "Role or Degree" },
  { value: "role_and_degree", label: "Role and Degree" },
] as const;

const ALL_ROLES = [
  { slug: "member", label: "Member" },
  { slug: "secretary", label: "Secretary" },
  { slug: "treasurer", label: "Treasurer" },
  { slug: "junior-warden", label: "Junior Warden" },
  { slug: "senior-warden", label: "Senior Warden" },
  { slug: "worshipful-master", label: "Worshipful Master" },
  { slug: "past-master", label: "Past Master" },
  { slug: "site-administrator", label: "Site Administrator" },
  { slug: "pm-super-administrator", label: "PM Super Administrator" },
];

const DEGREE_OPTIONS = [
  { value: 1, label: "Entered Apprentice (1)" },
  { value: 2, label: "Fellowcraft (2)" },
  { value: 3, label: "Master Mason (3)" },
];


function DomainCard({
  domain,
  isPmSuper,
  onEdit,
  onEditAccess,
  onDelete,
}: {
  domain: DocumentDomainItem;
  isPmSuper: boolean;
  onEdit: (d: DocumentDomainItem) => void;
  onEditAccess: (d: DocumentDomainItem) => void;
  onDelete: (d: DocumentDomainItem) => void;
}) {
  return (
    <Card className="border-card-border h-full">
      <CardContent className="p-5 flex flex-col gap-3 h-full">
        {/* Top row: icon left, menu right */}
        <div className="flex items-start justify-between gap-2">
          <div className="rounded-md bg-primary/10 p-2.5 shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPmSuper && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(domain)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Edit Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditAccess(domain)}>
                    <Settings2 className="h-3.5 w-3.5 mr-2" />
                    Edit Access
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(domain)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Title + description */}
        <div className="flex-1 min-h-0">
          <h3 className="font-semibold text-sm text-foreground leading-snug">{domain.name}</h3>
          {domain.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{domain.description}</p>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

export default function AdminDomainsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const level = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
  const isPmSuper = level >= PM_SUPER_LEVEL;

  const { data: domainsData, isLoading } = useListDocumentDomains();
  const createDomain = useCreateDocumentDomain();
  const updateDomain = useUpdateDocumentDomain();
  const updateAccess = useUpdateDocumentDomainAccess();
  const deleteDomain = useDeleteDocumentDomain();

  const domains = domainsData?.domains ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListDocumentDomainsQueryKey() });
  }

  // Create domain
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createFrame, setCreateFrame] = useState<"general" | "ritual">("general");
  const [createDesc, setCreateDesc] = useState("");
  const [createLogic, setCreateLogic] = useState<"role_only" | "degree_only" | "role_or_degree" | "role_and_degree">("role_only");
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [createDegree, setCreateDegree] = useState<string>("none");

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function handleCreate() {
    if (!createName.trim() || !createSlug.trim()) return;
    const minDegree = createDegree && createDegree !== "none" ? parseInt(createDegree) : null;
    createDomain.mutate(
      {
        data: {
          name: createName.trim(),
          slug: createSlug.trim(),
          frame: createFrame,
          description: createDesc.trim() || null,
          accessLogic: createLogic as DocumentDomainAccessUpdateInputAccessLogic,
          allowedRoleSlugs: createRoles,
          minDegree,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Domain created" });
          setShowCreate(false);
          setCreateName(""); setCreateSlug(""); setCreateFrame("general"); setCreateDesc("");
          setCreateLogic("role_only"); setCreateRoles([]); setCreateDegree("none");
          invalidate();
        },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to create domain", variant: "destructive" }),
      },
    );
  }

  // Edit details
  const [editTarget, setEditTarget] = useState<DocumentDomainItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  function openEdit(d: DocumentDomainItem) {
    setEditTarget(d);
    setEditName(d.name);
    setEditDesc(d.description ?? "");
  }

  function handleEdit() {
    if (!editTarget || !editName.trim()) return;
    updateDomain.mutate(
      { id: editTarget.id, data: { name: editName.trim(), description: editDesc.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Domain updated" });
          setEditTarget(null);
          invalidate();
        },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to update domain", variant: "destructive" }),
      },
    );
  }

  // Edit access rules
  const [accessTarget, setAccessTarget] = useState<DocumentDomainItem | null>(null);
  const [accessLogic, setAccessLogic] = useState<"role_only" | "degree_only" | "role_or_degree" | "role_and_degree">("role_only");
  const [accessRoles, setAccessRoles] = useState<string[]>([]);
  const [accessDegree, setAccessDegree] = useState<string>("none");

  function openEditAccess(d: DocumentDomainItem) {
    setLocation(`/admin/domains/${d.id}/access`);
  }

  function handleEditAccess() {
    if (!accessTarget) return;
    const minDegree = accessDegree && accessDegree !== "none" ? parseInt(accessDegree) : null;
    updateAccess.mutate(
      {
        id: accessTarget.id,
        data: {
          accessLogic: accessLogic as DocumentDomainAccessUpdateInputAccessLogic,
          allowedRoleSlugs: accessRoles,
          minDegree,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Access rules updated" });
          setAccessTarget(null);
          invalidate();
        },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to update access rules", variant: "destructive" }),
      },
    );
  }

  function toggleRole(slug: string, current: string[], set: (v: string[]) => void) {
    if (current.includes(slug)) set(current.filter((s) => s !== slug));
    else set([...current, slug]);
  }

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<DocumentDomainItem | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    deleteDomain.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Domain deleted" });
          setDeleteTarget(null);
          invalidate();
        },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to delete domain", variant: "destructive" }),
      },
    );
  }

  const needsDegreeForCreate = createLogic === "degree_only" || createLogic === "role_or_degree" || createLogic === "role_and_degree";
  const needsDegreeForAccess = accessLogic === "degree_only" || accessLogic === "role_or_degree" || accessLogic === "role_and_degree";

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Domains & Access Control</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure access rules for document domains. Access is calculated dynamically from roles and degrees.
            </p>
          </div>
          {isPmSuper && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" />
              New Domain
            </Button>
          )}
        </div>

        {!isPmSuper && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40 border border-border text-sm text-muted-foreground mb-6">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>You can view domain access rules. Only PM Super Administrators can create or edit domains.</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-8">
            {[0, 1].map((s) => (
              <div key={s}>
                <Skeleton className="h-5 w-40 mb-4 rounded" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : domains.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No domains configured yet.</p>
            </CardContent>
          </Card>
        ) : (() => {
          const generalDomains = domains.filter((d) => d.frame !== "ritual");
          const ritualDomains = domains.filter((d) => d.frame === "ritual");
          const showBoth = generalDomains.length > 0 && ritualDomains.length > 0;
          return (
            <div className="space-y-8">
              {generalDomains.length > 0 && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-foreground">General Information</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Access rules for administrative and member-facing domains.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {generalDomains.map((d) => (
                      <DomainCard key={d.id} domain={d} isPmSuper={isPmSuper} onEdit={openEdit} onEditAccess={openEditAccess} onDelete={setDeleteTarget} />
                    ))}
                  </div>
                </div>
              )}
              {showBoth && <Separator />}
              {ritualDomains.length > 0 && (
                <div>
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-foreground">Ritual Information</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Access rules for degree ritual materials and ceremonial resources.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ritualDomains.map((d) => (
                      <DomainCard key={d.id} domain={d} isPmSuper={isPmSuper} onEdit={openEdit} onEditAccess={openEditAccess} onDelete={setDeleteTarget} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Create Domain Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Domain</DialogTitle>
            <DialogDescription>Define a new access domain for document folders.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  className="mt-1.5"
                  placeholder="Treasury Documents"
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    setCreateSlug(autoSlug(e.target.value));
                  }}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium">Slug</label>
                <Input
                  className="mt-1.5 font-mono text-xs"
                  placeholder="treasury-documents"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Frame</label>
              <Select value={createFrame} onValueChange={(v) => setCreateFrame(v as "general" | "ritual")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Documents</SelectItem>
                  <SelectItem value="ritual">Ritual Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={2}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Access Logic</label>
              <Select value={createLogic} onValueChange={(v) => setCreateLogic(v as any)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LOGIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(createLogic === "role_only" || createLogic === "role_or_degree" || createLogic === "role_and_degree") && (
              <div>
                <label className="text-sm font-medium">Allowed Roles</label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r.slug} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={createRoles.includes(r.slug)}
                        onCheckedChange={() => toggleRole(r.slug, createRoles, setCreateRoles)}
                      />
                      <span className="text-sm">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {needsDegreeForCreate && (
              <div>
                <label className="text-sm font-medium">Minimum Degree</label>
                <Select value={createDegree} onValueChange={setCreateDegree}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="No degree requirement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No degree requirement</SelectItem>
                    {DEGREE_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!createName.trim() || !createSlug.trim() || createDomain.isPending}
            >
              {createDomain.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Details Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Domain</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                className="mt-1.5"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={!editName.trim() || updateDomain.isPending}>
              {updateDomain.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Access Rules Dialog */}
      <Dialog open={!!accessTarget} onOpenChange={(o) => { if (!o) setAccessTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Access Rules</DialogTitle>
            {accessTarget && (
              <DialogDescription>
                Updating access rules for <span className="font-medium text-foreground">{accessTarget.name}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Access Logic</label>
              <Select value={accessLogic} onValueChange={(v) => setAccessLogic(v as any)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LOGIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(accessLogic === "role_only" || accessLogic === "role_or_degree" || accessLogic === "role_and_degree") && (
              <div>
                <label className="text-sm font-medium">Allowed Roles</label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r.slug} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={accessRoles.includes(r.slug)}
                        onCheckedChange={() => toggleRole(r.slug, accessRoles, setAccessRoles)}
                      />
                      <span className="text-sm">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {needsDegreeForAccess && (
              <div>
                <label className="text-sm font-medium">Minimum Degree</label>
                <Select value={accessDegree} onValueChange={setAccessDegree}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="No degree requirement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No degree requirement</SelectItem>
                    {DEGREE_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessTarget(null)}>Cancel</Button>
            <Button onClick={handleEditAccess} disabled={updateAccess.isPending}>
              {updateAccess.isPending ? "Saving…" : "Save Rules"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">"{deleteTarget?.name}"</span>.
              Folders linked to this domain will lose their access rules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
