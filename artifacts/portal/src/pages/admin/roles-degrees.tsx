import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  getListRolesQueryKey,
  useListDegreeDefinitions,
  useUpdateDegreeDefinitions,
  getListDegreeDefinitionsQueryKey,
  type Role,
  type DegreeDefinition,
} from "@workspace/api-client-react";
import { ADMIN_LEVEL } from "@/lib/roles";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Shield, GraduationCap, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

type Tab = "roles" | "degrees";

// ─── Role Form ────────────────────────────────────────────────────────────────

interface RoleFormState {
  name: string;
  slug: string;
  permissionLevel: number;
  description: string;
}

const emptyRoleForm = (): RoleFormState => ({
  name: "",
  slug: "",
  permissionLevel: 20,
  description: "",
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PERMISSION_PRESETS = [
  { label: "Visitor (10)", value: 10 },
  { label: "Member (20)", value: 20 },
  { label: "Secretary (30)", value: 30 },
  { label: "Treasurer (40)", value: 40 },
  { label: "WM (50)", value: 50 },
];

interface RoleFormFieldsProps {
  form: RoleFormState;
  setForm: React.Dispatch<React.SetStateAction<RoleFormState>>;
  lockSlug: boolean;
}

function RoleFormFields({ form, setForm, lockSlug }: RoleFormFieldsProps) {
  function handleNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      slug: lockSlug ? prev.slug : slugify(name),
    }));
  }

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={form.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Worshipful Master"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Slug</Label>
        <Input
          value={form.slug}
          disabled={lockSlug}
          onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
          placeholder="e.g. worshipful-master"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">Lowercase letters, numbers and hyphens only.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Permission Level (1–89)</Label>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {PERMISSION_PRESETS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant={form.permissionLevel === p.value ? "default" : "outline"}
              className="text-xs h-7 px-2"
              onClick={() => setForm((prev) => ({ ...prev, permissionLevel: p.value }))}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Input
          type="number"
          min={1}
          max={89}
          value={form.permissionLevel}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setForm((p) => ({ ...p, permissionLevel: v }));
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Brief description of this role's responsibilities"
          rows={2}
        />
      </div>
    </div>
  );
}

// ─── Roles Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [forceConfirm, setForceConfirm] = useState<{ role: Role; count: number } | null>(null);
  const [forceDeleting, setForceDeleting] = useState(false);
  const [createForm, setCreateForm] = useState<RoleFormState>(emptyRoleForm());
  const [editForm, setEditForm] = useState<RoleFormState>(emptyRoleForm());

  const roles = data?.roles ?? [];

  function invalidateRoles() {
    queryClient.invalidateQueries({ queryKey: getListRolesQueryKey() });
  }

  function openCreate() {
    setCreateForm(emptyRoleForm());
    setShowCreate(true);
  }

  function openEdit(role: Role) {
    setEditForm({
      name: role.name,
      slug: role.slug,
      permissionLevel: role.permissionLevel,
      description: role.description ?? "",
    });
    setEditRole(role);
  }

  function extractError(err: unknown) {
    return (
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      "An error occurred"
    );
  }

  function handleCreate() {
    createRole.mutate(
      {
        data: {
          name: createForm.name.trim(),
          slug: createForm.slug.trim(),
          permissionLevel: createForm.permissionLevel,
          description: createForm.description.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Role created" });
          setShowCreate(false);
          invalidateRoles();
        },
        onError: (err) => toast({ title: extractError(err), variant: "destructive" }),
      }
    );
  }

  function handleUpdate() {
    if (!editRole) return;
    updateRole.mutate(
      {
        id: editRole.id,
        data: {
          name: editForm.name.trim(),
          ...(editRole.isSystem ? {} : { slug: editForm.slug.trim() }),
          permissionLevel: editForm.permissionLevel,
          description: editForm.description.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Role updated" });
          setEditRole(null);
          invalidateRoles();
        },
        onError: (err) => toast({ title: extractError(err), variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    const target = deleteTarget;
    deleteRole.mutate(
      { id: target.id },
      {
        onSuccess: () => {
          toast({ title: `"${name}" deleted` });
          setDeleteTarget(null);
          invalidateRoles();
        },
        onError: (err) => {
          const data = (err as { response?: { data?: { error?: string; assignedCount?: number } } })?.response?.data;
          if (data?.assignedCount && data.assignedCount > 0) {
            setDeleteTarget(null);
            setForceConfirm({ role: target, count: data.assignedCount });
          } else {
            toast({ title: data?.error ?? "An error occurred", variant: "destructive" });
            setDeleteTarget(null);
          }
        },
      }
    );
  }

  async function handleForceDelete() {
    if (!forceConfirm) return;
    setForceDeleting(true);
    try {
      const res = await fetch(`/api/roles/${forceConfirm.role.id}?force=true`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: `"${forceConfirm.role.name}" deleted` });
        invalidateRoles();
        setForceConfirm(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error ?? "Failed to delete role", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to delete role", variant: "destructive" });
    } finally {
      setForceDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define the permission roles available in this lodge.
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Role
        </Button>
      </div>

      <div className="rounded-md border divide-y">
        {roles.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">No roles found.</div>
        )}
        {roles.map((role) => (
          <div key={role.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{role.name}</span>
                <code className="text-xs bg-muted rounded px-1.5 py-0.5">{role.slug}</code>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  Level: <span className="font-medium">{role.permissionLevel}</span>
                </span>
                {role.description && (
                  <span className="text-xs text-muted-foreground truncate">{role.description}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openEdit(role)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!role.isSystem && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(role)}
                  title="Delete role"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Add a new permission role. Levels 1–89 allowed (Site Admin is 80).
            </DialogDescription>
          </DialogHeader>
          <RoleFormFields form={createForm} setForm={setCreateForm} lockSlug={false} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createRole.isPending || !createForm.name.trim() || !createForm.slug.trim()}>
              {createRole.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editRole} onOpenChange={(o) => { if (!o) setEditRole(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
          </DialogHeader>
          <RoleFormFields
            form={editForm}
            setForm={setEditForm}
            lockSlug={editRole?.isSystem ?? false}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateRole.isPending || !editForm.name.trim()}>
              {updateRole.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This role will be permanently removed. It cannot be deleted if any members are currently assigned to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force Delete Confirm — shown when role has members assigned */}
      <AlertDialog open={!!forceConfirm} onOpenChange={(o) => { if (!o && !forceDeleting) setForceConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force delete "{forceConfirm?.role.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This role is currently assigned to <strong>{forceConfirm?.count} member{forceConfirm?.count === 1 ? "" : "s"}</strong>. Deleting it will immediately revoke this role from all of them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forceDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleForceDelete}
              disabled={forceDeleting}
            >
              {forceDeleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete and Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Degrees Tab ──────────────────────────────────────────────────────────────

function DegreesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListDegreeDefinitions();
  const updateDefs = useUpdateDegreeDefinitions();

  const [localDefs, setLocalDefs] = useState<DegreeDefinition[] | null>(null);

  const baseDefs = data?.definitions ?? [];
  const working = localDefs ?? baseDefs;
  const isDirty = localDefs !== null;

  function cloneBase() {
    return JSON.parse(JSON.stringify(baseDefs)) as DegreeDefinition[];
  }

  function updateField(idx: number, field: keyof DegreeDefinition, value: string | number) {
    setLocalDefs((prev) => {
      const copy = JSON.parse(JSON.stringify(prev ?? baseDefs)) as DegreeDefinition[];
      (copy[idx] as Record<string, unknown>)[field] = value;
      return copy;
    });
  }

  function addDegree() {
    setLocalDefs((prev) => {
      const copy = JSON.parse(JSON.stringify(prev ?? baseDefs)) as DegreeDefinition[];
      const maxDeg = copy.reduce((m, d) => Math.max(m, d.degree), 0);
      copy.push({ degree: maxDeg + 1, name: "", abbreviation: "" });
      return copy;
    });
  }

  function removeDegree(idx: number) {
    setLocalDefs((prev) => {
      const copy = JSON.parse(JSON.stringify(prev ?? baseDefs)) as DegreeDefinition[];
      copy.splice(idx, 1);
      return copy;
    });
  }

  function handleSave() {
    updateDefs.mutate(
      { data: { definitions: working } },
      {
        onSuccess: () => {
          toast({ title: "Degree definitions saved" });
          setLocalDefs(null);
          queryClient.invalidateQueries({ queryKey: getListDegreeDefinitionsQueryKey() });
        },
        onError: (err: unknown) => {
          const msg =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Failed to save";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure the degree labels used when recording member degrees. Changes apply lodge-wide.
        </p>
        <Button size="sm" onClick={addDegree}>
          <Plus className="h-4 w-4 mr-1" />
          Add Degree
        </Button>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-[56px_1fr_100px_36px] gap-2 px-3 py-2 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          <span>#</span>
          <span>Name</span>
          <span>Abbreviation</span>
          <span />
        </div>
        {working.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No degree definitions yet.
          </div>
        )}
        {working.map((def, idx) => (
          <div key={idx} className="grid grid-cols-[56px_1fr_100px_36px] gap-2 px-3 py-2 border-b last:border-b-0 items-center">
            <Input
              type="number"
              className="h-7 text-xs text-center px-1"
              value={def.degree}
              min={0}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                updateField(idx, "degree", isNaN(v) ? 0 : v);
              }}
            />
            <Input
              className="h-7 text-xs"
              value={def.name}
              onChange={(e) => updateField(idx, "name", e.target.value)}
              placeholder="Degree name"
            />
            <Input
              className="h-7 text-xs font-mono"
              value={def.abbreviation}
              onChange={(e) => updateField(idx, "abbreviation", e.target.value)}
              placeholder="Abbr."
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => removeDegree(idx)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={updateDefs.isPending}>
            {updateDefs.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save Changes
          </Button>
          <Button variant="outline" onClick={() => setLocalDefs(null)}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}

export default function AdminRolesDegreesPage() {
  const { user } = useAuth();
  const level = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
  const [tab, setTab] = useState<Tab>("roles");

  if (level < ADMIN_LEVEL) {
    return (
      <AppLayout>
        <div className="p-6 text-center text-muted-foreground">Access denied.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roles &amp; Degrees</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage role definitions and degree type labels for this lodge.
          </p>
        </div>

        <div className="flex gap-1 border-b">
          <TabButton
            active={tab === "roles"}
            icon={<Shield className="h-4 w-4" />}
            onClick={() => setTab("roles")}
          >
            Role Types
          </TabButton>
          <TabButton
            active={tab === "degrees"}
            icon={<GraduationCap className="h-4 w-4" />}
            onClick={() => setTab("degrees")}
          >
            Degree Types
          </TabButton>
        </div>

        {tab === "roles" ? <RolesTab /> : <DegreesTab />}
      </div>
    </AppLayout>
  );
}
