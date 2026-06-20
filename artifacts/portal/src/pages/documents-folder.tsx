import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Link } from "wouter";

pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

import {
  useGetDocumentFolder,
  getGetDocumentFolderQueryKey,
  useListFolderDocuments,
  getListFolderDocumentsQueryKey,
  downloadDocument,
  viewDocument,
  useUpdateDocumentStatus,
  useUpdateDocumentFolder,
  useDeleteDocumentFolder,
  useCreateDocumentSubfolder,
  useGetDocumentNoticeStatus,
  getGetDocumentNoticeStatusQueryKey,
  useAcceptDocumentNotice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import {
  FolderOpen,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Folder,
  AlertCircle,
  FileText,
  Download,
  Eye,
  Upload,
  FileX,
  Loader2,
  Info,
  Undo2,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MEMBER_LEVEL = 20;
const SITE_ADMIN_LEVEL = 80;

interface Props {
  id: string;
}

function getUserLevel(roles: { permissionLevel: number }[] | undefined): number {
  if (!roles || roles.length === 0) return 0;
  return Math.max(...roles.map((r) => r.permissionLevel));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FolderDialogMode = "rename-folder" | "add-subfolder" | "rename-subfolder";

interface FolderDialogState {
  mode: FolderDialogMode;
  subfolderId?: string;
  currentTitle: string;
  currentDescription: string;
}

export default function DocumentsFolderPage({ id }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userLevel = getUserLevel(user?.roles);
  const isAdmin = userLevel >= SITE_ADMIN_LEVEL;

  const {
    data: folder,
    isLoading: folderLoading,
    isError: folderError,
    error,
  } = useGetDocumentFolder(id);

  const { data: docsData, isLoading: docsLoading } = useListFolderDocuments(id, {
    query: { queryKey: getListFolderDocumentsQueryKey(id), enabled: !folderError },
  });

  const withdrawDoc = useUpdateDocumentStatus();
  const deleteDoc   = useUpdateDocumentStatus();
  const updateFolder   = useUpdateDocumentFolder();
  const deleteSubfolder = useDeleteDocumentFolder();
  const createSubfolder = useCreateDocumentSubfolder();

  const { data: noticeStatus } = useGetDocumentNoticeStatus({
    query: { queryKey: getGetDocumentNoticeStatusQueryKey(), enabled: folder?.domainSlug === "general-documents" },
  });
  const acceptNotice = useAcceptDocumentNotice();
  const noticeAccepted = noticeStatus?.accepted ?? false;
  const [noticeExpanded, setNoticeExpanded] = useState(false);

  function handleAcceptNotice() {
    acceptNotice.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDocumentNoticeStatusQueryKey() });
        setNoticeExpanded(false);
      },
    });
  }

  const [uploadOpen, setUploadOpen] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [viewingIds, setViewingIds] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<{ objectUrl: string; fileName: string; mimeType: string } | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number>(0);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleteSubfolderTarget, setDeleteSubfolderTarget] = useState<{ id: string; title: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");

  const isAccessDenied = (error as any)?.status === 403;
  const canUpload = folder?.canUpload ?? false;
  const canManage = folder?.canManage ?? false;

  const documents = docsData?.documents ?? [];

  const STATUS_FILTERS: { value: string; label: string }[] = [
    { value: "all",           label: "All" },
    { value: "published",     label: "Published" },
    { value: "pending_review",label: "Pending" },
    { value: "rejected",      label: "Rejected" },
    { value: "archived",      label: "Archived" },
    { value: "withdrawn",     label: "Withdrawn" },
    { value: "deleted",       label: "Deleted" },
  ];

  const filteredDocuments = statusFilter === "all"
    ? documents
    : documents.filter((d) => d.status === statusFilter);

  function isBrowserViewable(mimeType: string): boolean {
    return (
      mimeType === "application/pdf" ||
      mimeType.startsWith("image/") ||
      mimeType === "text/plain"
    );
  }

  async function handleView(docId: string, fileName: string, mimeType: string) {
    if (viewingIds.has(docId)) return;
    setViewingIds((prev) => new Set(prev).add(docId));
    try {
      const blob = await viewDocument(docId);
      const objectUrl = URL.createObjectURL(blob);
      setPdfPage(1);
      setPdfNumPages(0);
      setViewer({ objectUrl, fileName, mimeType });
    } catch {
      toast({ title: "Could not load document", variant: "destructive" });
    } finally {
      setViewingIds((prev) => { const n = new Set(prev); n.delete(docId); return n; });
    }
  }

  function closeViewer() {
    if (viewer) URL.revokeObjectURL(viewer.objectUrl);
    setViewer(null);
    setPdfPage(1);
    setPdfNumPages(0);
  }

  async function handleDownload(docId: string, fileName: string) {
    if (downloadingIds.has(docId)) return;
    setDownloadingIds((prev) => new Set(prev).add(docId));
    try {
      const blob = await downloadDocument(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Access denied / not found — server enforces the rule
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }

  function handleWithdraw() {
    if (!withdrawTarget) return;
    withdrawDoc.mutate(
      { id: withdrawTarget.id, data: { status: "withdrawn" } },
      {
        onSuccess: () => {
          toast({ title: "Submission withdrawn" });
          setWithdrawTarget(null);
          queryClient.invalidateQueries({ queryKey: getListFolderDocumentsQueryKey(id) });
        },
        onError: () => {
          toast({ title: "Failed to withdraw submission", variant: "destructive" });
          setWithdrawTarget(null);
        },
      },
    );
  }

  function handleDeleteDoc() {
    if (!deleteDocTarget) return;
    deleteDoc.mutate(
      { id: deleteDocTarget.id, data: { status: "deleted" } },
      {
        onSuccess: () => {
          toast({ title: "Document deleted" });
          setDeleteDocTarget(null);
          queryClient.invalidateQueries({ queryKey: getListFolderDocumentsQueryKey(id) });
        },
        onError: () => {
          toast({ title: "Failed to delete document", variant: "destructive" });
          setDeleteDocTarget(null);
        },
      },
    );
  }

  function openFolderDialog(mode: FolderDialogMode, sub?: { id: string; title: string; description?: string | null }) {
    const currentTitle = mode === "rename-subfolder" && sub ? sub.title
      : mode === "rename-folder" ? (folder?.title ?? "")
      : "";
    const currentDescription = mode === "rename-subfolder" && sub ? (sub.description ?? "")
      : mode === "rename-folder" ? (folder?.description ?? "")
      : "";
    setDialogTitle(currentTitle);
    setDialogDescription(currentDescription);
    setFolderDialog({ mode, subfolderId: sub?.id, currentTitle, currentDescription });
  }

  function handleFolderDialogSave() {
    if (!folderDialog) return;
    const trimmedTitle = dialogTitle.trim();
    if (!trimmedTitle) return;

    if (folderDialog.mode === "rename-folder") {
      updateFolder.mutate(
        { id, data: { title: trimmedTitle, description: dialogDescription.trim() || null } },
        {
          onSuccess: () => {
            toast({ title: "Folder renamed" });
            setFolderDialog(null);
            queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(id) });
          },
          onError: () => toast({ title: "Failed to rename folder", variant: "destructive" }),
        },
      );
    } else if (folderDialog.mode === "add-subfolder") {
      createSubfolder.mutate(
        { id, data: { title: trimmedTitle, description: dialogDescription.trim() || undefined } },
        {
          onSuccess: () => {
            toast({ title: "Subfolder created" });
            setFolderDialog(null);
            queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(id) });
          },
          onError: () => toast({ title: "Failed to create subfolder", variant: "destructive" }),
        },
      );
    } else if (folderDialog.mode === "rename-subfolder" && folderDialog.subfolderId) {
      updateFolder.mutate(
        { id: folderDialog.subfolderId, data: { title: trimmedTitle, description: dialogDescription.trim() || null } },
        {
          onSuccess: () => {
            toast({ title: "Subfolder renamed" });
            setFolderDialog(null);
            queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(id) });
          },
          onError: () => toast({ title: "Failed to rename subfolder", variant: "destructive" }),
        },
      );
    }
  }

  function handleDeleteSubfolder() {
    if (!deleteSubfolderTarget) return;
    deleteSubfolder.mutate(
      { id: deleteSubfolderTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Subfolder deleted" });
          setDeleteSubfolderTarget(null);
          queryClient.invalidateQueries({ queryKey: getGetDocumentFolderQueryKey(id) });
        },
        onError: () => {
          toast({ title: "Failed to delete subfolder", variant: "destructive" });
          setDeleteSubfolderTarget(null);
        },
      },
    );
  }

  const isFolderDialogPending = updateFolder.isPending || createSubfolder.isPending;

  const folderDialogLabels: Record<FolderDialogMode, { title: string; action: string }> = {
    "rename-folder":    { title: "Rename Folder",    action: "Save" },
    "add-subfolder":    { title: "Add Subfolder",    action: "Create" },
    "rename-subfolder": { title: "Rename Subfolder", action: "Save" },
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
          <Link href="/documents" className="hover:text-foreground transition-colors">
            Documents
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {folderLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <>
              {folder?.parentId && folder?.parentTitle && (
                <>
                  <Link
                    href={`/documents/${folder.parentId}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {folder.parentTitle}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
              <span className="text-foreground font-medium">{folder?.title ?? "Folder"}</span>
            </>
          )}
        </nav>

        {/* Access denied */}
        {folderError && isAccessDenied && (
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

        {/* Other error */}
        {folderError && !isAccessDenied && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Failed to load folder. Please try again.
            </CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {folderLoading && (
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

        {/* Folder content */}
        {!folderLoading && !folderError && folder && (
          <>
            {/* Folder header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="rounded-md bg-primary/10 p-2.5 mt-0.5 shrink-0">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-foreground leading-tight">
                  {folder.title}
                </h1>
                {folder.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{folder.description}</p>
                )}
                {(isAdmin || canManage) && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => openFolderDialog("rename-folder")}
                    >
                      <Pencil className="h-3 w-3" />
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => openFolderDialog("add-subfolder")}
                    >
                      <FolderPlus className="h-3 w-3" />
                      Add Subfolder
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Document Library Notice — General Documents only */}
            {folder.domainSlug === "general-documents" && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                {/* Collapsed header (always visible after acceptance) */}
                {noticeAccepted ? (
                  <button
                    type="button"
                    onClick={() => setNoticeExpanded((v) => !v)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left"
                  >
                    <Info className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex-1">
                      Document Library Notice
                    </span>
                    {noticeExpanded
                      ? <ChevronUp className="h-4 w-4 text-amber-600 shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-amber-600 shrink-0" />}
                  </button>
                ) : (
                  <div className="flex gap-3 p-4">
                    <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Document Library Notice
                    </span>
                  </div>
                )}

                {/* Notice body — always shown when not accepted; shown when expanded after acceptance */}
                {(!noticeAccepted || noticeExpanded) && (
                  <div className={cn("px-4 pb-4 space-y-2.5 text-sm text-amber-900 dark:text-amber-200", noticeAccepted && "pt-0 border-t border-amber-200 dark:border-amber-800")}>
                    <p>
                      This Document Library exists to support the personal development of our
                      Brethren, to preserve the history and traditions of our Lodge, and to
                      facilitate the sharing of knowledge, education, and information that may
                      help us become better men.
                    </p>
                    <p>
                      Before uploading any material, please ensure that you have the right to
                      share it. Copyrighted works, commercial publications, or materials
                      belonging to third parties should only be uploaded when permission has
                      been obtained or when their distribution is otherwise permitted by law.
                    </p>
                    <p>
                      Please do not upload material that may be considered offensive,
                      discriminatory, unlawful, harmful, explicit, or otherwise inconsistent
                      with the values of Freemasonry and the good reputation of our Lodge.
                    </p>
                    <p>
                      All submitted documents are reviewed before publication. This review is
                      intended not only to ensure compliance with the above principles, but
                      also to prevent accidental publication of incorrect, duplicate,
                      misplaced, or unintended material.
                    </p>
                    <p>
                      Brethren are kindly reminded that certain Masonic materials may be
                      intended only for specific degrees or offices. If you are unsure where a
                      document belongs, or whether it should be shared within a restricted
                      area of the portal, please contact a Site Administrator. They will be
                      pleased to assist in placing the material in the appropriate location.
                    </p>
                    <p>
                      By contributing to this library, you help preserve and share knowledge
                      for the benefit of the Craft and future generations of Brethren.
                    </p>
                    <p className="italic text-foreground/60 dark:text-amber-400/70">
                      Thank you for your care, discretion, and fraternal spirit.
                    </p>

                    {/* Acceptance checkbox — only shown before acceptance */}
                    {!noticeAccepted && (
                      <label className="flex items-start gap-2.5 pt-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-700 cursor-pointer shrink-0"
                          checked={acceptNotice.isPending}
                          disabled={acceptNotice.isPending}
                          onChange={handleAcceptNotice}
                        />
                        <span className="text-sm text-amber-900 dark:text-amber-200 leading-snug">
                          I have read and understood the Document Library Notice.
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Subfolders section */}
            {(folder.subfolders.length > 0 || (isAdmin || canManage)) && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                  Subfolders
                </h2>
                {folder.subfolders.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {folder.subfolders.map((sub) => (
                      <div key={sub.id} className="relative group">
                        <Card className="border border-card-border border-t-2 border-t-sidebar-active overflow-hidden hover:border-primary/30 hover:shadow-md transition-all">
                          <CardContent className="p-4 flex items-center gap-3">
                            <Link
                              href={`/documents/${sub.id}`}
                              className="flex items-center gap-3 flex-1 min-w-0"
                            >
                              <div className="rounded-md bg-muted p-2 shrink-0">
                                <Folder className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {sub.title}
                                </p>
                                {sub.description && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {sub.description}
                                  </p>
                                )}
                                {sub.subfolderCount > 0 && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {sub.subfolderCount} subfolder
                                    {sub.subfolderCount !== 1 ? "s" : ""}
                                  </p>
                                )}
                              </div>
                            </Link>
                            {(isAdmin || canManage) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.preventDefault()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => openFolderDialog("rename-subfolder", sub)}
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    disabled={sub.subfolderCount > 0}
                                    onClick={() => setDeleteSubfolderTarget({ id: sub.id, title: sub.title })}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No subfolders yet.</p>
                )}
              </section>
            )}

            {/* Documents section */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Documents
                </h2>
                {canUpload && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUploadOpen(true)}
                    className="gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Document
                  </Button>
                )}
              </div>

              {/* Status filter pills — admins and approvers */}
              {(isAdmin || folder?.canApprove) && documents.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {STATUS_FILTERS.map(({ value, label }) => {
                    const count = value === "all"
                      ? documents.length
                      : documents.filter((d) => d.status === value).length;
                    if (value !== "all" && count === 0) return null;
                    const active = statusFilter === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setStatusFilter(value)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                        )}
                      >
                        {label}
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                          active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Loading docs skeleton */}
              {docsLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!docsLoading && filteredDocuments.length === 0 && (
                <Card className={cn("border-card-border", canUpload && "border-dashed")}>
                  <CardContent className="py-10 text-center">
                    <FileX className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2.5" />
                    <p className="text-sm text-muted-foreground">No documents yet.</p>
                    {canUpload && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 gap-1.5"
                        onClick={() => setUploadOpen(true)}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload the first document
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Document list */}
              {!docsLoading && filteredDocuments.length > 0 && (
                <div className="space-y-2">
                  {filteredDocuments.map((doc) => {
                    const isUploader = doc.uploaderId === user?.id;
                    const showBadge =
                      doc.status !== "published" && (isUploader || isAdmin || folder?.canApprove);
                    const isDownloading = downloadingIds.has(doc.id);

                    return (
                      <Card key={doc.id} className="border border-card-border border-t-2 border-t-sidebar-active overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-md bg-muted p-2 shrink-0 mt-0.5">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium text-foreground">
                                  {doc.title}
                                </p>
                                {showBadge && (
                                  <DocumentStatusBadge status={doc.status} />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {doc.originalFileName}
                                {" · "}
                                {formatBytes(doc.fileSize)}
                              </p>
                              {doc.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {doc.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1.5">
                                {doc.uploaderName
                                  ? `Uploaded by ${doc.uploaderName}`
                                  : "Uploaded"}
                                {" · "}
                                {formatDate(doc.createdAt)}
                              </p>
                              {doc.status === "rejected" &&
                                doc.rejectionReason &&
                                (isUploader || isAdmin || folder?.canApprove) && (
                                  <p className="text-xs text-destructive mt-1.5 flex items-start gap-1">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    <span>Rejected: {doc.rejectionReason}</span>
                                  </p>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isAdmin && isUploader && doc.status === "pending_review" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                                  onClick={() => setWithdrawTarget({ id: doc.id, title: doc.title })}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Withdraw</span>
                                </Button>
                              )}
                              {isBrowserViewable(doc.mimeType) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  disabled={viewingIds.has(doc.id)}
                                  onClick={() => handleView(doc.id, doc.originalFileName, doc.mimeType)}
                                >
                                  {viewingIds.has(doc.id)
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Eye className="h-3.5 w-3.5" />}
                                  <span className="hidden sm:inline">
                                    {viewingIds.has(doc.id) ? "Loading…" : "View"}
                                  </span>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={isDownloading}
                                onClick={() =>
                                  handleDownload(doc.id, doc.originalFileName)
                                }
                              >
                                {isDownloading
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Download className="h-3.5 w-3.5" />
                                }
                                <span className="hidden sm:inline">
                                  {isDownloading ? "Downloading…" : "Download"}
                                </span>
                              </Button>
                              {(isAdmin || canManage) && doc.status !== "deleted" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteDocTarget({ id: doc.id, title: doc.title })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Delete</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Upload dialog — mounted outside folder content so it persists */}
      {folder && (
        <UploadDocumentDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          folderId={id}
          folderTitle={folder.title}
        />
      )}

      {/* Inline document viewer */}
      <Dialog open={!!viewer} onOpenChange={(o) => { if (!o) closeViewer(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-medium truncate pr-8">
              {viewer?.fileName ?? ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto flex flex-col items-center">
            {viewer?.mimeType.startsWith("image/") ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                <img
                  src={viewer.objectUrl}
                  alt={viewer.fileName}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : viewer?.mimeType === "application/pdf" ? (
              <div className="w-full flex flex-col items-center py-4 gap-2">
                <Document
                  file={viewer.objectUrl}
                  onLoadSuccess={({ numPages }) => setPdfNumPages(numPages)}
                  loading={
                    <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
                    </div>
                  }
                  error={
                    <p className="py-8 text-sm text-destructive">Failed to load PDF.</p>
                  }
                >
                  <Page
                    pageNumber={pdfPage}
                    width={Math.min(880, window.innerWidth - 80)}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                </Document>
                {pdfNumPages > 1 && (
                  <div className="flex items-center gap-3 pb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pdfPage <= 1}
                      onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pdfPage} of {pdfNumPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pdfPage >= pdfNumPages}
                      onClick={() => setPdfPage((p) => Math.min(pdfNumPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <iframe
                src={viewer?.objectUrl}
                title={viewer?.fileName ?? "Document"}
                className="w-full h-full border-0"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename / create subfolder dialog */}
      <Dialog open={!!folderDialog} onOpenChange={(o) => { if (!o) setFolderDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {folderDialog ? folderDialogLabels[folderDialog.mode].title : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="folder-dialog-title">Name</Label>
              <Input
                id="folder-dialog-title"
                value={dialogTitle}
                onChange={(e) => setDialogTitle(e.target.value)}
                placeholder="Folder name"
                onKeyDown={(e) => { if (e.key === "Enter") handleFolderDialogSave(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="folder-dialog-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="folder-dialog-desc"
                value={dialogDescription}
                onChange={(e) => setDialogDescription(e.target.value)}
                placeholder="Short description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)}>Cancel</Button>
            <Button
              onClick={handleFolderDialogSave}
              disabled={!dialogTitle.trim() || isFolderDialogPending}
            >
              {isFolderDialogPending ? "Saving…" : (folderDialog ? folderDialogLabels[folderDialog.mode].action : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete document confirmation */}
      <AlertDialog
        open={!!deleteDocTarget}
        onOpenChange={(o) => { if (!o) setDeleteDocTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteDocTarget?.title}&rdquo; will be marked as deleted and
              hidden from all members. This action can be reversed by a site
              administrator.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDoc}
              disabled={deleteDoc.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDoc.isPending ? "Deleting…" : "Delete Document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Withdraw submission confirmation */}
      <AlertDialog
        open={!!withdrawTarget}
        onOpenChange={(o) => { if (!o) setWithdrawTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw submission?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{withdrawTarget?.title}&rdquo; will be marked as withdrawn and
              removed from the review queue. The file will remain in the audit
              history but will no longer be visible to other members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWithdraw}
              disabled={withdrawDoc.isPending}
            >
              {withdrawDoc.isPending ? "Withdrawing…" : "Withdraw Submission"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete subfolder confirmation */}
      <AlertDialog
        open={!!deleteSubfolderTarget}
        onOpenChange={(o) => { if (!o) setDeleteSubfolderTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subfolder?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteSubfolderTarget?.title}&rdquo; and all its contents will
              be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubfolder}
              disabled={deleteSubfolder.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubfolder.isPending ? "Deleting…" : "Delete Subfolder"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
