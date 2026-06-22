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
import { Switch } from "@/components/ui/switch";
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
  useGetNavConfig,
  useUpdateNavConfig,
  getGetNavConfigQueryKey,
  type DocumentDomainItem,
  type DocumentDomainAccessUpdateInputAccessLogic,
  type NavConfigItem,
} from "@workspace/api-client-react";
import {
  Shield, Plus, MoreHorizontal, Pencil, Trash2, Settings2, AlertCircle, Lock,
  LayoutDashboard, BookOpen, Landmark, CalendarDays, Cake, FolderOpen,
} from "lucide-react";
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

const MIN_LEVEL_OPTIONS = [
  { value: 10, label: "All authenticated users (Visitor+)" },
  { value: 20, label: "Full members only (Member+)" },
];

const NAV_ITEM_REGISTRY = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { slug: "tracing-board", label: "Tracing Board", icon: BookOpen },
  { slug: "history", label: "History", icon: Landmark },
  { slug: "events", label: "Events", icon: CalendarDays },
  { slug: "birthdays", label: "Birthdays", icon: Cake },
  { slug: "documents", label: "Documents", icon: FolderOpen },
] as const;

function DomainCard({
  domain,
  isPmSuper,
  isAdmin,
  onEdit,
  onEditAccess,
  onDelete,
}: {
  domain: DocumentDomainItem;
  isPmSuper: boolean;
  isAdmin: boolean;
  onEdit: (d: DocumentDomainItem) => void;
  onEditAccess: (d: DocumentDomainItem) => void;
  onDelete: (d: DocumentDomainItem) => void;
}) {
  const isProtected = domain.domainProtectionLevel === "past_master_protected";
  const canManage = isPmSuper || !isProtected;

  return (
    <Card className="border-card-border h-full">
      <CardContent className="p-5 flex flex-col gap-3 h-full">
        <div className="flex items-start justify-between gap-2">
          <div className="rounded-md bg-primary/10 p-2.5 shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isProtected && !isPmSuper && (
              <div
                className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5"
                title="Only a PM Super Administrator may manage this domain."
              >
                <Lock className="h-3 w-3" />
                <span>Past Master Protected</span>
              </div>
            )}
            {(isPmSuper || isAdmin) && canManage && (
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

        <div className="flex-1 min-h-0">
          <h3 className="font-semibold text-sm text-foreground leading-snug">{domain.name}</h3>
          {domain.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{domain.description}</p>
          )}
        </div>

        {isProtected && isPmSuper && (
          <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 w-fit">
            <Lock className="h-3 w-3" />
            <span>Past Master Protected</span>
          </div>
        )}
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
  const isAdmin = level >= ADMIN_LEVEL;
  const isPmSuper = level >= PM_SUPER_LEVEL;

  const [activeTab, setActiveTab] = useState<"domains" | "navigation">("domains");

  // ── Domain queries / mutations ────────────────────────────────────────────
  const { data, isLoading } = useListDocumentDomains({
    query: { enabled: isAdmin, queryKey: getListDocumentDomainsQueryKey() },
  });
  const domains = data?.domains ?? [];

  const createDomain = useCreateDocumentDomain();
  const updateDomain = useUpdateDocumentDomain();
  const updateAccess = useUpdateDocumentDomainAccess();
  const deleteDomain = useDeleteDocumentDomain();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListDocumentDomainsQueryKey() });
  }

  // ── Nav config queries / mutations ────────────────────────────────────────
  const { data: navConfigData, isLoading: navLoading } = useGetNavConfig({
    query: { enabled: isAdmin, queryKey: getGetNavConfigQueryKey() },
  });
  const updateNavConfig = useUpdateNavConfig();

  const [pendingNav, setPendingNav] = useState<NavConfigItem[] | null>(null);
  const [navDirty, setNavDirty] = useState(false);

  const displayedNavItems: NavConfigItem[] = pendingNav ?? (navConfigData?.items ?? NAV_ITEM_REGISTRY.map((n) => ({ slug: n.slug, enabled: true, minLevel: 10 })));

  function getNavItem(slug: string) {
    return displayedNavItems.find((i) => i.slug === slug) ?? { slug, enabled: true, minLevel: 10 };
  }

  function updateNavItem(slug: string, patch: Partial<NavConfigItem>) {
    const base: NavConfigItem[] = navConfigData?.items ?? NAV_ITEM_REGISTRY.map((n) => ({ slug: n.slug, enabled: true, minLevel: 10 }));
    const current = pendingNav ?? base;
    const updated = NAV_ITEM_REGISTRY.map((reg) => {
      const existing = current.find((i) => i.slug === reg.slug) ?? { slug: reg.slug, enabled: true, minLevel: 10 };
      return existing.slug === slug ? { ...existing, ...patch } : existing;
    });
    setPendingNav(updated);
    setNavDirty(true);
  }

  function handleSaveNav() {
    if (!pendingNav) return;
    updateNavConfig.mutate(
      { data: { items: pendingNav } },
      {
        onSuccess: (data) => {
          toast({ title: "Navigation saved" });
          queryClient.setQueryData(getGetNavConfigQueryKey(), data);
          setPendingNav(null);
          setNavDirty(false);
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          toast({
            title: "Failed to save navigation",
            description: status ? `Server returned ${status}` : "Network error — please try again",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleDiscardNav() {
    setPendingNav(null);
    setNavDirty(false);
  }

  // ── Domain dialog state ───────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createFrame, setCreateFrame] = useState<"general" | "ritual">("general");
  const [createDesc, setCreateDesc] = useState("");
  const [createProtected, setCreateProtected] = useState(false);
  const [createLogic, setCreateLogic] = useState<"role_only" | "degree_only" | "role_or_degree" | "role_and_degree">("role_only");
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [createDegree, setCreateDegree] = useState<string>("none");

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function toggleRole(slug: string, current: string[], setter: (v: string[]) => void) {
    setter(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
  }

  function handleCreate() {
    createDomain.mutate(
      {
        data: {
          name: createName.trim(),
          slug: createSlug.trim(),
          frame: createFrame,
          description: createDesc.trim() || undefined,
          domainProtectionLevel: createProtected ? "past_master_protected" : "standard",
          accessLogic: createLogic,
          allowedRoleSlugs: createRoles,
          minDegree: createDegree !== "none" ? parseInt(createDegree, 10) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Domain created" });
          setShowCreate(false);
          setCreateName(""); setCreateSlug(""); setCreateDesc(""); setCreateProtected(false);
          setCreateLogic("role_only"); setCreateRoles([]); setCreateDegree("none");
          invalidate();
        },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to create domain", variant: "destructive" }),
      },
    );
  }

  const [editTarget, setEditTarget] = useState<DocumentDomainItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  function openEdit(d: DocumentDomainItem) {
    setEditTarget(d); setEditName(d.name); setEditDesc(d.description ?? "");
  }

  function handleEdit() {
    if (!editTarget) return;
    updateDomain.mutate(
      { id: editTarget.id, data: { name: editName.trim(), description: editDesc.trim() || undefined } },
      {
        onSuccess: () => { toast({ title: "Domain updated" }); setEditTarget(null); invalidate(); },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to update domain", variant: "destructive" }),
      },
    );
  }

  const [accessTarget, setAccessTarget] = useState<DocumentDomainItem | null>(null);
  const [accessLogic, setAccessLogic] = useState<"role_only" | "degree_only" | "role_or_degree" | "role_and_degree">("role_only");
  const [accessRoles, setAccessRoles] = useState<string[]>([]);
  const [accessDegree, setAccessDegree] = useState<string>("none");

  function openEditAccess(d: DocumentDomainItem) {
    setAccessTarget(d);
    setAccessLogic(d.accessLogic as any);
    setAccessRoles(d.allowedRoleSlugs ?? []);
    setAccessDegree(d.minDegree != null ? String(d.minDegree) : "none");
    setLocation(`/admin/domains/${d.id}`);
  }

  function handleEditAccess() {
    if (!accessTarget) return;
    updateAccess.mutate(
      {
        id: accessTarget.id,
        data: {
          accessLogic: accessLogic as DocumentDomainAccessUpdateInputAccessLogic,
          allowedRoleSlugs: accessRoles,
          minDegree: accessDegree !== "none" ? parseInt(accessDegree, 10) : undefined,
        },
      },
      {
        onSuccess: () => { toast({ title: "Access rules updated" }); setAccessTarget(null); setLocation("/admin/domains"); invalidate(); },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to update access rules", variant: "destructive" }),
      },
    );
  }

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
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Domains & Access Control</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure document domain access rules and member navigation visibility.
            </p>
          </div>
          {activeTab === "domains" && (isPmSuper || isAdmin) && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" />
              New Domain
            </Button>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setActiveTab("domains")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "domains"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Document Domains
          </button>
          <button
            onClick={() => setActiveTab("navigation")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "navigation"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Navigation Menu
            {navDirty && (
              <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />
            )}
          </button>
        </div>

        {/* ── Document Domains tab ─────────────────────────────────────── */}
        {activeTab === "domains" && (
          <>
            {!isPmSuper && isAdmin && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40 border border-border text-sm text-muted-foreground mb-6">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>You can manage standard domains. Past Master Protected domains require PM Super Administrator access.</span>
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
                          <DomainCard key={d.id} domain={d} isPmSuper={isPmSuper} isAdmin={isAdmin} onEdit={openEdit} onEditAccess={openEditAccess} onDelete={setDeleteTarget} />
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
                          <DomainCard key={d.id} domain={d} isPmSuper={isPmSuper} isAdmin={isAdmin} onEdit={openEdit} onEditAccess={openEditAccess} onDelete={setDeleteTarget} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* ── Navigation Menu tab ──────────────────────────────────────── */}
        {activeTab === "navigation" && (
          <div className="max-w-2xl">
            <p className="text-sm text-muted-foreground mb-5">
              Control which menu items are visible to members and at what permission level. Changes take effect immediately for all logged-in users.
            </p>

            {navLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {NAV_ITEM_REGISTRY.map((reg) => {
                  const cfg = getNavItem(reg.slug);
                  const Icon = reg.icon;
                  return (
                    <div
                      key={reg.slug}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-lg border transition-colors",
                        cfg.enabled
                          ? "bg-card border-card-border"
                          : "bg-muted/30 border-border opacity-60"
                      )}
                    >
                      <div className="rounded-md bg-primary/10 p-2 shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{reg.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {cfg.enabled
                            ? (MIN_LEVEL_OPTIONS.find((o) => o.value === cfg.minLevel)?.label ?? `Level ${cfg.minLevel}+`)
                            : "Hidden from all members"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <Select
                          value={String(cfg.minLevel)}
                          onValueChange={(v) => updateNavItem(reg.slug, { minLevel: parseInt(v, 10) })}
                          disabled={!cfg.enabled}
                        >
                          <SelectTrigger className="w-44 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MIN_LEVEL_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Switch
                          checked={cfg.enabled}
                          onCheckedChange={(v) => updateNavItem(reg.slug, { enabled: v })}
                          aria-label={`Toggle ${reg.label}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {navDirty && (
              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border">
                <Button
                  onClick={handleSaveNav}
                  disabled={updateNavConfig.isPending}
                  size="sm"
                >
                  {updateNavConfig.isPending ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDiscardNav}>
                  Discard
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs (unchanged) ─────────────────────────────────────────────── */}

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
            {isPmSuper && (
              <div className="flex items-start gap-2.5 p-3 rounded-md border border-amber-500/30 bg-amber-500/5">
                <Checkbox
                  id="create-protected"
                  checked={createProtected}
                  onCheckedChange={(v) => setCreateProtected(!!v)}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor="create-protected" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    Past Master Protected
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">Site Administrators will not be able to edit, delete, or modify the access matrix for this domain.</p>
                </div>
              </div>
            )}
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
