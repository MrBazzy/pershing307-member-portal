import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDocumentReview,
  useUpdateDocumentStatus,
  getListDocumentReviewQueryKey,
  getGetDocumentReviewCountQueryKey,
} from "@workspace/api-client-react";
import type { DocumentReviewItem } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  ClipboardCheck,
  FileText,
  CheckCircle2,
  XCircle,
  Trash2,
  Folder,
  Calendar,
  User,
  AlertCircle,
  Eye,
  Download,
  ShieldAlert,
  Copy,
  FileWarning,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toUpperCase() : "Unknown";
}

function getMimeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF Document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document (.docx)",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet (.xlsx)",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint Presentation (.pptx)",
    "image/jpeg": "JPEG Image",
    "image/png": "PNG Image",
    "text/plain": "Plain Text",
  };
  return map[mimeType] ?? mimeType;
}

function isImage(mimeType: string): boolean {
  return mimeType === "image/jpeg" || mimeType === "image/png";
}

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

function isText(mimeType: string): boolean {
  return mimeType === "text/plain";
}

function isPreviewable(mimeType: string): boolean {
  return isPdf(mimeType) || isImage(mimeType) || isText(mimeType);
}

// ── Viewer component ──────────────────────────────────────────────────────────

function DocumentViewer({ doc }: { doc: DocumentReviewItem }) {
  const viewUrl = `/api/documents/${doc.id}/view`;
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(false);

  useEffect(() => {
    if (!isText(doc.mimeType)) return;
    setTextLoading(true);
    setTextError(false);
    fetch(viewUrl)
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.text();
      })
      .then((t) => setTextContent(t))
      .catch(() => setTextError(true))
      .finally(() => setTextLoading(false));
  }, [doc.id, doc.mimeType, viewUrl]);

  if (isPdf(doc.mimeType)) {
    return (
      <div className="flex flex-col gap-2 h-full">
        <iframe
          src={viewUrl}
          title={doc.title}
          className="w-full flex-1 rounded border border-border min-h-[480px]"
        />
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground underline self-end"
        >
          Open in new tab ↗
        </a>
      </div>
    );
  }

  if (isImage(doc.mimeType)) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <img
          src={viewUrl}
          alt={doc.title}
          className="max-w-full max-h-[480px] rounded border border-border object-contain shadow-sm"
        />
      </div>
    );
  }

  if (isText(doc.mimeType)) {
    if (textLoading) {
      return (
        <div className="flex items-center justify-center h-40 gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      );
    }
    if (textError) {
      return (
        <div className="flex items-center justify-center h-40 gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Failed to load file content.
        </div>
      );
    }
    return (
      <pre className="text-xs bg-muted rounded border border-border p-4 overflow-auto max-h-[480px] font-mono whitespace-pre-wrap break-words">
        {textContent}
      </pre>
    );
  }

  // Office docs / other unsupported types
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Preview not available</p>
        <p className="text-xs text-muted-foreground mt-1">
          {getMimeLabel(doc.mimeType)} files cannot be previewed in the browser.
        </p>
      </div>
      <a href={`/api/documents/${doc.id}/download`} download={doc.originalFileName}>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Download for Review
        </Button>
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDocumentReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useListDocumentReview();
  const updateStatus = useUpdateDocumentStatus();

  const [viewTarget, setViewTarget] = useState<DocumentReviewItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DocumentReviewItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentReviewItem | null>(null);

  const documents = data?.documents ?? [];
  const pendingCount = data?.pendingCount ?? 0;

  // Build duplicate map: originalFileName → count, fileSize → count
  const fileNameCounts = new Map<string, number>();
  const fileSizeCounts = new Map<number, number>();
  for (const d of documents) {
    fileNameCounts.set(d.originalFileName, (fileNameCounts.get(d.originalFileName) ?? 0) + 1);
    fileSizeCounts.set(d.fileSize, (fileSizeCounts.get(d.fileSize) ?? 0) + 1);
  }

  function hasDuplicate(doc: DocumentReviewItem): boolean {
    return (
      (fileNameCounts.get(doc.originalFileName) ?? 0) > 1 ||
      (fileSizeCounts.get(doc.fileSize) ?? 0) > 1
    );
  }

  function invalidateReview() {
    queryClient.invalidateQueries({ queryKey: getListDocumentReviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDocumentReviewCountQueryKey() });
  }

  function handleApprove(doc: DocumentReviewItem) {
    updateStatus.mutate(
      { id: doc.id, data: { status: "published" } },
      {
        onSuccess: () => {
          toast({ title: `"${doc.title}" approved and published` });
          if (viewTarget?.id === doc.id) setViewTarget(null);
          invalidateReview();
        },
        onError: () =>
          toast({ title: "Failed to approve document", variant: "destructive" }),
      },
    );
  }

  function handleReject() {
    if (!rejectTarget) return;
    updateStatus.mutate(
      {
        id: rejectTarget.id,
        data: {
          status: "rejected",
          rejectionReason: rejectReason.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `"${rejectTarget.title}" rejected` });
          if (viewTarget?.id === rejectTarget.id) setViewTarget(null);
          setRejectTarget(null);
          setRejectReason("");
          invalidateReview();
        },
        onError: () =>
          toast({ title: "Failed to reject document", variant: "destructive" }),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    updateStatus.mutate(
      { id: deleteTarget.id, data: { status: "deleted" } },
      {
        onSuccess: () => {
          toast({ title: `"${deleteTarget.title}" deleted` });
          if (viewTarget?.id === deleteTarget.id) setViewTarget(null);
          setDeleteTarget(null);
          invalidateReview();
        },
        onError: () =>
          toast({ title: "Failed to delete document", variant: "destructive" }),
      },
    );
  }

  const uploaderName = (doc: DocumentReviewItem) =>
    doc.uploaderFirstName && doc.uploaderLastName
      ? `${doc.uploaderFirstName} ${doc.uploaderLastName}`
      : doc.uploaderEmail ?? "Unknown";

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">Document Review</h1>
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 border">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Inspect and approve or reject member document uploads before they are published.
          </p>
        </div>

        {isError && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
              Failed to load review queue. Please try again.
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && !isError && documents.length === 0 && (
          <Card className="border-card-border border-dashed">
            <CardContent className="py-16 text-center">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">
                No documents are waiting for review.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && documents.length > 0 && (
          <div className="space-y-3">
            {documents.map((doc) => {
              const name = uploaderName(doc);
              const ext = getExtension(doc.originalFileName);
              const duplicate = hasDuplicate(doc);

              return (
                <Card key={doc.id} className="border-card-border">
                  <CardContent className="p-4">
                    {/* Header row */}
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-muted p-2 shrink-0 mt-0.5">
                        {isImage(doc.mimeType)
                          ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          : <FileText className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground leading-snug">
                            {doc.title}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                            {ext}
                          </Badge>
                          {duplicate && (
                            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 border gap-1">
                              <Copy className="h-2.5 w-2.5" />
                              Possible duplicate
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {doc.originalFileName} · {formatBytes(doc.fileSize)} · {getMimeLabel(doc.mimeType)}
                        </p>

                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {doc.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {name}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Folder className="h-3 w-3" />
                            {doc.folderTitle}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(doc.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action row */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setViewTarget(doc)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Document
                      </Button>

                      <a
                        href={`/api/documents/${doc.id}/download`}
                        download={doc.originalFileName}
                        className="inline-flex"
                      >
                        <Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground">
                          <Download className="h-3.5 w-3.5" />
                          Download for Review
                        </Button>
                      </a>

                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/10"
                          disabled={updateStatus.isPending}
                          onClick={() => handleApprove(doc)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={updateStatus.isPending}
                          onClick={() => {
                            setRejectTarget(doc);
                            setRejectReason("");
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                          disabled={updateStatus.isPending}
                          onClick={() => setDeleteTarget(doc)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── View Document Sheet ────────────────────────────────────────────────── */}
      <Sheet open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <SheetContent className="sm:max-w-3xl w-full overflow-y-auto flex flex-col gap-0 p-0">
          {viewTarget && (
            <>
              <SheetHeader className="px-6 py-4 border-b border-border">
                <SheetTitle className="text-base leading-snug">{viewTarget.title}</SheetTitle>
                <SheetDescription className="text-xs font-mono truncate">
                  {viewTarget.originalFileName}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 flex flex-col gap-0 overflow-y-auto">
                {/* Metadata grid */}
                <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Uploaded by</p>
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      {uploaderName(viewTarget)}
                    </p>
                    {viewTarget.uploaderEmail && (
                      <p className="text-xs text-muted-foreground ml-[18px]">{viewTarget.uploaderEmail}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Folder</p>
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                      <Folder className="h-3 w-3 text-muted-foreground shrink-0" />
                      {viewTarget.folderTitle}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Upload date</p>
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                      {formatDate(viewTarget.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">File size</p>
                    <p className="text-sm text-foreground">{formatBytes(viewTarget.fileSize)}</p>
                  </div>
                  {viewTarget.description && (
                    <div className="col-span-2">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Description</p>
                      <p className="text-sm text-foreground">{viewTarget.description}</p>
                    </div>
                  )}
                </div>

                {/* Security info */}
                <div className="px-6 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Security information</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-[11px] font-mono gap-1">
                      <FileText className="h-3 w-3" />
                      {getExtension(viewTarget.originalFileName)}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {viewTarget.mimeType}
                    </Badge>
                    {hasDuplicate(viewTarget) && (
                      <Badge className="text-[11px] gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 border">
                        <FileWarning className="h-3 w-3" />
                        Possible duplicate in queue
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Viewer */}
                <div className="px-6 py-4 flex-1">
                  {isPreviewable(viewTarget.mimeType) ? (
                    <DocumentViewer doc={viewTarget} />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                      <div className="rounded-full bg-muted p-4">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Preview not available</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {getMimeLabel(viewTarget.mimeType)} files cannot be previewed in the browser.
                          Use the download button to review this file.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sheet action buttons */}
                <div className="px-6 py-4 border-t border-border flex items-center gap-2 flex-wrap bg-background sticky bottom-0">
                  <a
                    href={`/api/documents/${viewTarget.id}/download`}
                    download={viewTarget.originalFileName}
                    className="inline-flex"
                  >
                    <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
                      <Download className="h-3.5 w-3.5" />
                      Download for Review
                    </Button>
                  </a>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/10"
                      disabled={updateStatus.isPending}
                      onClick={() => handleApprove(viewTarget)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                      disabled={updateStatus.isPending}
                      onClick={() => {
                        setRejectTarget(viewTarget);
                        setRejectReason("");
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Reject Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            {rejectTarget && (
              <DialogDescription>
                Rejecting{" "}
                <span className="font-medium text-foreground">
                  "{rejectTarget.title}"
                </span>
                . This will notify the uploader.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2 py-1">
            <label className="text-sm font-medium">
              Reason{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this document was rejected…"
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? "Rejecting…" : "Reject Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete{" "}
              <span className="font-medium text-foreground">
                "{deleteTarget?.title}"
              </span>{" "}
              and remove it from the review queue. This action cannot be undone.
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
