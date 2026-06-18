import { useState } from "react";
import { Link } from "wouter";
import {
  useGetDocumentFolder,
  useCreateDocumentSubfolder,
  useUpdateDocumentFolder,
  useDeleteDocumentFolder,
  getListDocumentFoldersQueryKey,
  getGetDocumentFolderQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderOpen,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Folder,
  AlertCircle,
} from "lucide-react";
import { ADMIN_LEVEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
}

export default function DocumentsFolderPage({ id }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const level = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
  const isAdmin = level >= ADMIN_LEVEL;

  const { data: folder, isLoading, isError, error } = useGetDocumentFolder(id);

  const createSubfolder = useCreateDocumentSubfolder();
  const updateFolder = useUpdateDocumentFolder();
  const deleteFolder = useDeleteDocumentFolder();

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");

  const [editFolderOpen, setEditFolderOpen] = useState(false);
  const [editFolderTitle, setEditFolderTitle] = useState("");
  const [editFolderDesc, setEditFolderDesc] = useState("");

  const [editSubfolder, setEditSubfolder] = useState<{ id: string; title: string; description: string | null } | null>(null);
  const [editSubTitle, setEditSubTitle] = useState("");
  const [editSubDesc, setEditSubDesc] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListDocumentFoldersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(id) });
  }

  function handleCreateSubfolder() {
    if (!createTitle.trim()) return;
    createSubfolder.mutate(
      { id, data: { title: createTitle.trim(), description: createDesc.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Subfolder created" });
          setCreateOpen(false);
          setCreateTitle("");
          setCreateDesc("");
          invalidate();
        },
        onError: () => toast({ title: "Failed to create subfolder", variant: "destructive" }),
      }
    );
  }

  function openEditFolder() {
    setEditFolderTitle(folder?.title ?? "");
    setEditFolderDesc(folder?.description ?? "");
    setEditFolderOpen(true);
  }

  function handleEditFolder() {
    if (!editFolderTitle.trim()) return;
    updateFolder.mutate(
      { id, data: { title: editFolderTitle.trim(), description: editFolderDesc.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Folder updated" });
          setEditFolderOpen(false);
          invalidate();
        },
        onError: () => toast({ title: "Failed to update folder", variant: "destructive" }),
      }
    );
  }

  function openEditSubfolder(sub: { id: string; title: string; description: string | null }) {
    setEditSubfolder(sub);
    setEditSubTitle(sub.title);
    setEditSubDesc(sub.description ?? "");
  }

  function handleEditSubfolder() {
    if (!editSubfolder || !editSubTitle.trim()) return;
    updateFolder.mutate(
      { id: editSubfolder.id, data: { title: editSubTitle.trim(), description: editSubDesc.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Subfolder renamed" });
          setEditSubfolder(null);
          invalidate();
        },
        onError: () => toast({ title: "Failed to rename subfolder", variant: "destructive" }),
      }
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
          invalidate();
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "Failed to delete subfolder";
          toast({ title: msg, variant: "destructive" });
          setDeleteTarget(null);
        },
      }
    );
  }

  const isAccessDenied = (error as any)?.status === 403;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
          <Link href="/documents" className="hover:text-foreground transition-colors">
            Documents
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="text-foreground font-medium">{folder?.title ?? "Folder"}</span>
          )}
        </nav>

        {isError && isAccessDenied && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Access Denied</p>
              <p className="text-xs text-muted-foreground mt-1">
                You do not have permission to view this folder.
              </p>
              <Link href="/documents">
                <Button variant="outline" size="sm" className="mt-4">
                  Back to Documents
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {isError && !isAccessDenied && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Failed to load folder. Please try again.
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && !isError && folder && (
          <>
            {/* Folder header */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-2.5">
                  <FolderOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground leading-tight">
                    {folder.title}
                  </h1>
                  {folder.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{folder.description}</p>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={openEditFolder} className="shrink-0">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              )}
            </div>

            {/* Subfolders section */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Subfolders
              </h2>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Subfolder
                </Button>
              )}
            </div>

            {folder.subfolders.length === 0 ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-10 text-center">
                  <Folder className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2.5" />
                  <p className="text-sm text-muted-foreground">No subfolders yet.</p>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Subfolder
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {folder.subfolders.map((sub) => (
                  <Card
                    key={sub.id}
                    className={cn(
                      "border-card-border transition-shadow",
                      isAdmin ? "pr-2" : ""
                    )}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-md bg-muted p-2 shrink-0">
                        <Folder className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{sub.title}</p>
                        {sub.description && (
                          <p className="text-xs text-muted-foreground truncate">{sub.description}</p>
                        )}
                        {sub.subfolderCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {sub.subfolderCount} subfolder{sub.subfolderCount !== 1 ? "s" : ""}
                          </p>
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
                            <DropdownMenuItem onClick={() => openEditSubfolder(sub)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ id: sub.id, title: sub.title })}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Subfolder Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subfolder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                className="mt-1.5"
                placeholder="e.g. 2026"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateSubfolder(); }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={2}
                placeholder="Brief description…"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubfolder} disabled={!createTitle.trim() || createSubfolder.isPending}>
              {createSubfolder.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Root Folder Dialog */}
      <Dialog open={editFolderOpen} onOpenChange={setEditFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                className="mt-1.5"
                value={editFolderTitle}
                onChange={(e) => setEditFolderTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={3}
                value={editFolderDesc}
                onChange={(e) => setEditFolderDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolderOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditFolder}
              disabled={!editFolderTitle.trim() || updateFolder.isPending}
            >
              {updateFolder.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subfolder Dialog */}
      <Dialog open={!!editSubfolder} onOpenChange={(open) => { if (!open) setEditSubfolder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Subfolder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                className="mt-1.5"
                value={editSubTitle}
                onChange={(e) => setEditSubTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleEditSubfolder(); }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={2}
                value={editSubDesc}
                onChange={(e) => setEditSubDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSubfolder(null)}>Cancel</Button>
            <Button
              onClick={handleEditSubfolder}
              disabled={!editSubTitle.trim() || updateFolder.isPending}
            >
              {updateFolder.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subfolder?</AlertDialogTitle>
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
