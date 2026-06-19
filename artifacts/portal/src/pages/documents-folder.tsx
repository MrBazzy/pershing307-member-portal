import { useState } from "react";
import { Link } from "wouter";
import {
  useGetDocumentFolder,
  useListFolderDocuments,
  getListFolderDocumentsQueryKey,
  downloadDocument,
  useUpdateDocumentStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import {
  FolderOpen,
  ChevronRight,
  Folder,
  AlertCircle,
  FileText,
  Download,
  Upload,
  FileX,
  Loader2,
  Undo2,
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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: string; title: string } | null>(null);

  const isAccessDenied = (error as any)?.status === 403;

  const canUpload =
    folder !== undefined &&
    ((folder.domainSlug === "general-documents" && userLevel >= MEMBER_LEVEL) || isAdmin);

  const documents = docsData?.documents ?? [];

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
            <span className="text-foreground font-medium">{folder?.title ?? "Folder"}</span>
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
            <div className="flex items-center gap-3 mb-5">
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

            {/* Subfolders section — only shown when there are subfolders */}
            {folder.subfolders.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
                  Subfolders
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {folder.subfolders.map((sub) => (
                    <Link key={sub.id} href={`/documents/${sub.id}`}>
                      <Card className="border-card-border cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all">
                        <CardContent className="p-4 flex items-center gap-3">
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
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
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

              {/* Loading docs skeleton */}
              {docsLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!docsLoading && documents.length === 0 && (
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
              {!docsLoading && documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const isUploader = doc.uploaderId === user?.id;
                    const showBadge =
                      doc.status !== "published" && (isUploader || isAdmin);
                    const isDownloading = downloadingIds.has(doc.id);

                    return (
                      <Card key={doc.id} className="border-card-border">
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
                                (isUploader || isAdmin) && (
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
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={isDownloading}
                                onClick={() =>
                                  handleDownload(doc.id, doc.originalFileName)
                                }
                              >
                                {isDownloading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                <span className="hidden sm:inline">
                                  {isDownloading ? "Downloading…" : "Download"}
                                </span>
                              </Button>
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
    </AppLayout>
  );
}
