import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDocumentFolders,
  useGetDocumentFolder,
  useCreateDocumentSubfolder,
  useUpdateDocumentFolder,
  useDeleteDocumentFolder,
  useLinkDocumentFolderDomain,
  useListDocumentDomains,
  getListDocumentFoldersQueryKey,
  getGetDocumentFolderQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  BookOpen,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Folder,
  Link2,
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";
import { ADMIN_LEVEL, PM_SUPER_LEVEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

const RITUAL_BG = "bg-amber-500/10";
const RITUAL_ICON = "text-amber-600 dark:text-amber-500";
const GENERAL_BG = "bg-primary/10";
const GENERAL_ICON = "text-primary";

function formatAccessLogic(logic: string): string {
  return {
    role_only: "Role Only",
    degree_only: "Degree Only",
    role_or_degree: "Role or Degree",
    role_and_degree: "Role and Degree",
  }[logic] ?? logic;
}

interface FolderRowProps {
  folder: {
    id: string;
    title: string;
    description?: string | null;
    frame: string;
    isSystemRoot: boolean;
    domainId?: string | null;
    subfolderCount: number;
  };
  domainMap: Map<string, string>;
  isAdmin: boolean;
  isPmSuper: boolean;
  onEdit: (folder: { id: string; title: string; description: string | null }) => void;
  onLinkDomain: (folder: { id: string; title: string; domainId: string | null; frame: string }) => void;
  onDelete: (folder: { id: string; title: string }) => void;
  onAddSubfolder: (parentId: string, parentTitle: string) => void;
}

function SubfolderList({ folderId, isAdmin, onEdit, onDelete }: {
  folderId: string;
  isAdmin: boolean;
  onEdit: (folder: { id: string; title: string; description: string | null }) => void;
  onDelete: (folder: { id: string; title: string }) => void;
}) {
  const { data, isLoading } = useGetDocumentFolder(folderId);

  if (isLoading) return <div className="pl-8 py-2"><Skeleton className="h-8 w-48" /></div>;
  if (!data?.subfolders?.length) return null;

  return (
    <div className="pl-8 space-y-1 pb-2">
      {data.subfolders.map((sub) => (
        <div key={sub.id} className="flex items-center gap-2 py-1 group">
          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm text-foreground flex-1">{sub.title}</span>
          {sub.description && (
            <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[200px]">
              {sub.description}
            </span>
          )}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit({ id: sub.id, title: sub.title, description: sub.description ?? null })}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete({ id: sub.id, title: sub.title })}
                  disabled={sub.subfolderCount > 0}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}
    </div>
  );
}

function FolderRow({ folder, domainMap, isAdmin, isPmSuper, onEdit, onLinkDomain, onDelete, onAddSubfolder }: FolderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isRitual = folder.frame === "ritual";
  const domainName = folder.domainId ? domainMap.get(folder.domainId) : undefined;

  return (
    <div className="border border-card-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-card hover:bg-muted/30 transition-colors">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setExpanded(!expanded)}
          disabled={folder.subfolderCount === 0}
        >
          {folder.subfolderCount > 0
            ? expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            : <span className="h-3.5 w-3.5" />
          }
        </Button>

        <div className={cn("rounded p-1.5 shrink-0", isRitual ? RITUAL_BG : GENERAL_BG)}>
          {isRitual
            ? <BookOpen className={cn("h-3.5 w-3.5", RITUAL_ICON)} />
            : <FolderOpen className={cn("h-3.5 w-3.5", GENERAL_ICON)} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{folder.title}</span>
            {folder.isSystemRoot && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1">System</Badge>
            )}
            {domainName && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 gap-1 text-muted-foreground">
                <Shield className="h-2.5 w-2.5" />
                {domainName}
              </Badge>
            )}
            {folder.subfolderCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {folder.subfolderCount} subfolder{folder.subfolderCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {folder.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{folder.description}</p>
          )}
        </div>

        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit({ id: folder.id, title: folder.title, description: folder.description ?? null })}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename / Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddSubfolder(folder.id, folder.title)}>
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add Subfolder
              </DropdownMenuItem>
              {isPmSuper && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onLinkDomain({ id: folder.id, title: folder.title, domainId: folder.domainId ?? null, frame: folder.frame })}>
                    <Link2 className="h-3.5 w-3.5 mr-2" />
                    Link Domain
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {expanded && folder.subfolderCount > 0 && (
        <SubfolderList
          folderId={folder.id}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

export default function AdminDocumentManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const level = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
  const isAdmin = level >= ADMIN_LEVEL;
  const isPmSuper = level >= PM_SUPER_LEVEL;

  const { data: foldersData, isLoading: foldersLoading } = useListDocumentFolders();
  const { data: domainsData } = useListDocumentDomains();

  const createSubfolder = useCreateDocumentSubfolder();
  const updateFolder = useUpdateDocumentFolder();
  const deleteFolder = useDeleteDocumentFolder();
  const linkDomain = useLinkDocumentFolderDomain();

  const allFolders = foldersData?.folders ?? [];
  const generalFolders = allFolders.filter((f) => f.frame !== "ritual");
  const ritualFolders = allFolders.filter((f) => f.frame === "ritual");

  const domains = domainsData?.domains ?? [];
  const domainMap = new Map(domains.map((d) => [d.id, d.name]));

  const [editFolder, setEditFolder] = useState<{ id: string; title: string; description: string | null } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [addSubfolder, setAddSubfolder] = useState<{ parentId: string; parentTitle: string } | null>(null);
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");

  const [linkTarget, setLinkTarget] = useState<{ id: string; title: string; domainId: string | null; frame: string } | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");
  const [selectedFrame, setSelectedFrame] = useState<"general" | "ritual">("general");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListDocumentFoldersQueryKey() });
    if (editFolder) {
      queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(editFolder.id) });
    }
  }

  function openEdit(folder: { id: string; title: string; description: string | null }) {
    setEditFolder(folder);
    setEditTitle(folder.title);
    setEditDesc(folder.description ?? "");
  }

  function handleEdit() {
    if (!editFolder || !editTitle.trim()) return;
    updateFolder.mutate(
      { id: editFolder.id, data: { title: editTitle.trim(), description: editDesc.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Folder updated" });
          setEditFolder(null);
          invalidateAll();
        },
        onError: () => toast({ title: "Failed to update folder", variant: "destructive" }),
      },
    );
  }

  function handleAddSubfolder() {
    if (!addSubfolder || !subTitle.trim()) return;
    createSubfolder.mutate(
      { id: addSubfolder.parentId, data: { title: subTitle.trim(), description: subDesc.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Subfolder created" });
          setAddSubfolder(null);
          setSubTitle("");
          setSubDesc("");
          queryClient.invalidateQueries({ queryKey: getListDocumentFoldersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(addSubfolder.parentId) });
        },
        onError: () => toast({ title: "Failed to create subfolder", variant: "destructive" }),
      },
    );
  }

  function openLinkDomain(target: { id: string; title: string; domainId: string | null; frame: string }) {
    setLinkTarget(target);
    setSelectedDomainId(target.domainId ?? "");
    setSelectedFrame(target.frame === "ritual" ? "ritual" : "general");
  }

  function handleLinkDomain() {
    if (!linkTarget) return;
    linkDomain.mutate(
      {
        id: linkTarget.id,
        data: {
          domainId: selectedDomainId || null,
          frame: selectedFrame,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Domain linked" });
          setLinkTarget(null);
          queryClient.invalidateQueries({ queryKey: getListDocumentFoldersQueryKey() });
        },
        onError: (e: any) =>
          toast({ title: e?.data?.error ?? "Failed to link domain", variant: "destructive" }),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteFolder.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: `"${deleteTarget.title}" deleted` });
          setDeleteTarget(null);
          invalidateAll();
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "Failed to delete folder";
          toast({ title: msg, variant: "destructive" });
          setDeleteTarget(null);
        },
      },
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Document Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage folder structure, subfolders, and domain assignments.
          </p>
        </div>

        {foldersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {/* General Documents Frame */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  General Documents
                </h2>
              </div>
              <div className="space-y-2">
                {generalFolders.length === 0 && (
                  <p className="text-sm text-muted-foreground">No general folders found.</p>
                )}
                {generalFolders.map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    domainMap={domainMap}
                    isAdmin={isAdmin}
                    isPmSuper={isPmSuper}
                    onEdit={openEdit}
                    onLinkDomain={openLinkDomain}
                    onDelete={setDeleteTarget}
                    onAddSubfolder={(pid, pt) => { setAddSubfolder({ parentId: pid, parentTitle: pt }); setSubTitle(""); setSubDesc(""); }}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Ritual Documents Frame */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Ritual Documents
                </h2>
              </div>
              <div className="space-y-2">
                {ritualFolders.length === 0 && (
                  <p className="text-sm text-muted-foreground">No ritual folders found.</p>
                )}
                {ritualFolders.map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    domainMap={domainMap}
                    isAdmin={isAdmin}
                    isPmSuper={isPmSuper}
                    onEdit={openEdit}
                    onLinkDomain={openLinkDomain}
                    onDelete={setDeleteTarget}
                    onAddSubfolder={(pid, pt) => { setAddSubfolder({ parentId: pid, parentTitle: pt }); setSubTitle(""); setSubDesc(""); }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Folder Dialog */}
      <Dialog open={!!editFolder} onOpenChange={(o) => { if (!o) setEditFolder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                className="mt-1.5"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolder(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={!editTitle.trim() || updateFolder.isPending}>
              {updateFolder.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Subfolder Dialog */}
      <Dialog open={!!addSubfolder} onOpenChange={(o) => { if (!o) setAddSubfolder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subfolder</DialogTitle>
            {addSubfolder && (
              <DialogDescription>
                Creating inside <span className="font-medium text-foreground">{addSubfolder.parentTitle}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                className="mt-1.5"
                placeholder="e.g. 2026"
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddSubfolder(); }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={2}
                placeholder="Brief description…"
                value={subDesc}
                onChange={(e) => setSubDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubfolder(null)}>Cancel</Button>
            <Button onClick={handleAddSubfolder} disabled={!subTitle.trim() || createSubfolder.isPending}>
              {createSubfolder.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Domain Dialog */}
      <Dialog open={!!linkTarget} onOpenChange={(o) => { if (!o) setLinkTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Domain</DialogTitle>
            {linkTarget && (
              <DialogDescription>
                Set the access domain and frame for <span className="font-medium text-foreground">{linkTarget.title}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Domain</label>
              <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="No domain (unlinked)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No domain</SelectItem>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Frame</label>
              <Select value={selectedFrame} onValueChange={(v) => setSelectedFrame(v as "general" | "ritual")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Documents</SelectItem>
                  <SelectItem value="ritual">Ritual Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkTarget(null)}>Cancel</Button>
            <Button onClick={handleLinkDomain} disabled={linkDomain.isPending}>
              {linkDomain.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">"{deleteTarget?.title}"</span>.
              This cannot be undone.
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
