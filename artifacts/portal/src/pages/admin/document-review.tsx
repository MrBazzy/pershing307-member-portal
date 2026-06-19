import { useState } from "react";
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
} from "lucide-react";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminDocumentReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useListDocumentReview();
  const updateStatus = useUpdateDocumentStatus();

  const [rejectTarget, setRejectTarget] = useState<DocumentReviewItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentReviewItem | null>(null);

  const documents = data?.documents ?? [];
  const pendingCount = data?.pendingCount ?? 0;

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
          setDeleteTarget(null);
          invalidateReview();
        },
        onError: () =>
          toast({ title: "Failed to delete document", variant: "destructive" }),
      },
    );
  }

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
            Review and approve or reject member document uploads.
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
              <Skeleton key={i} className="h-28 rounded-lg" />
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
              const uploaderName =
                doc.uploaderFirstName && doc.uploaderLastName
                  ? `${doc.uploaderFirstName} ${doc.uploaderLastName}`
                  : doc.uploaderEmail ?? "Unknown";

              return (
                <Card key={doc.id} className="border-card-border">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-muted p-2 shrink-0 mt-0.5">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {doc.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {doc.originalFileName} · {formatBytes(doc.fileSize)}
                        </p>
                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {doc.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {uploaderName}
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

                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
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

      {/* Reject Dialog */}
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

      {/* Delete Confirmation */}
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
