import { useRef, useState } from "react";
import {
  useListHistoryDocuments,
  useCreateHistoryDocument,
  useUpdateHistoryDocument,
  useDeleteHistoryDocument,
  useRemoveHistoryDocumentAttachment,
  getListHistoryDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminHistoryLayout } from "@/components/history/admin-history-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FileText, Upload, Download, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryDoc {
  id: string;
  title: string;
  description: string | null;
  documentDate: string | null;
  category: string | null;
  fileUrl: string | null;
  sortOrder: number;
}

interface DocForm {
  title: string;
  description: string;
  documentDate: string;
  category: string;
}

const emptyForm: DocForm = { title: "", description: "", documentDate: "", category: "" };

const CATEGORY_COLORS: Record<string, string> = {
  Charter: "bg-amber-100 text-amber-800 border-amber-200",
  Petition: "bg-blue-100 text-blue-800 border-blue-200",
  Minutes: "bg-slate-100 text-slate-700 border-slate-200",
  Correspondence: "bg-green-100 text-green-800 border-green-200",
  Photograph: "bg-purple-100 text-purple-800 border-purple-200",
  Certificate: "bg-rose-100 text-rose-800 border-rose-200",
};

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.docx";

const SUGGESTED_CATEGORIES = [
  "Charter", "Petition", "Minutes", "Correspondence", "Photograph", "Certificate", "Other",
];

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cls = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium border", cls)}>
      {category}
    </span>
  );
}

function openAttachment(fileUrl: string) {
  window.open(`/api/storage${fileUrl}`, "_blank", "noopener,noreferrer");
}

export default function AdminHistoryDocumentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListHistoryDocuments();
  const create = useCreateHistoryDocument();
  const update = useUpdateHistoryDocument();
  const remove = useDeleteHistoryDocument();
  const removeAttachment = useRemoveHistoryDocumentAttachment();

  const [addOpen, setAddOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<HistoryDoc | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<HistoryDoc | null>(null);
  const [removeAttachDoc, setRemoveAttachDoc] = useState<HistoryDoc | null>(null);
  const [form, setForm] = useState<DocForm>(emptyForm);

  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocRef = useRef<string | null>(null);

  const documents = (data?.documents ?? []) as HistoryDoc[];

  function openAdd() {
    setForm(emptyForm);
    setAddOpen(true);
  }

  function openEdit(doc: HistoryDoc) {
    setForm({
      title: doc.title,
      description: doc.description ?? "",
      documentDate: doc.documentDate ?? "",
      category: doc.category ?? "",
    });
    setEditDoc(doc);
  }

  function closeAll() {
    setAddOpen(false);
    setEditDoc(null);
    setDeleteDoc(null);
    setRemoveAttachDoc(null);
    setForm(emptyForm);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListHistoryDocumentsQueryKey() });
  }

  const formValid = form.title.trim().length > 0;
  const isSaving = create.isPending || update.isPending;

  function handleSaveAdd() {
    create.mutate(
      {
        data: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          documentDate: form.documentDate.trim() || null,
          category: form.category.trim() || null,
        },
      },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Document added" }); },
        onError: () => toast({ title: "Failed to add document", variant: "destructive" }),
      }
    );
  }

  function handleSaveEdit() {
    if (!editDoc) return;
    update.mutate(
      {
        id: editDoc.id,
        data: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          documentDate: form.documentDate.trim() || null,
          category: form.category.trim() || null,
        },
      },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Document updated" }); },
        onError: () => toast({ title: "Failed to update document", variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    if (!deleteDoc) return;
    remove.mutate(
      { id: deleteDoc.id },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Document removed" }); },
        onError: () => toast({ title: "Failed to delete document", variant: "destructive" }),
      }
    );
  }

  function handleRemoveAttachment() {
    if (!removeAttachDoc) return;
    removeAttachment.mutate(
      { id: removeAttachDoc.id },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Attachment removed" }); },
        onError: () => toast({ title: "Failed to remove attachment", variant: "destructive" }),
      }
    );
  }

  function triggerUpload(docId: string) {
    pendingDocRef.current = docId;
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";

    const docId = pendingDocRef.current;
    pendingDocRef.current = null;

    if (!file || !docId) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast({ title: "Unsupported file type", description: "Allowed: PDF, JPG, PNG, DOCX.", variant: "destructive" });
      return;
    }

    setUploadingDocId(docId);
    setUploadProgress("Requesting upload URL…");

    try {
      const urlRes = await fetch(`/api/history/documents/${docId}/request-upload`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to get upload URL");
      }

      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      setUploadProgress("Uploading file…");

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putRes.ok) throw new Error("Upload to storage failed");

      setUploadProgress("Saving…");

      const saveRes = await fetch(`/api/history/documents/${docId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: objectPath }),
      });

      if (!saveRes.ok) throw new Error("Failed to save attachment link");

      invalidate();
      toast({ title: "Attachment uploaded" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploadingDocId(null);
      setUploadProgress("");
    }
  }

  return (
    <AdminHistoryLayout>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Manage historical documents and file attachments.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Document
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-card-border">
              <CardContent className="py-4 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="py-14 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No documents yet. Click "Add Document" to begin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const isUploading = uploadingDocId === doc.id;
            return (
              <Card key={doc.id} className="border-card-border">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-muted shrink-0 mt-0.5">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground leading-snug">
                          {doc.title}
                        </h3>
                        <CategoryBadge category={doc.category} />
                      </div>
                      {doc.documentDate && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{doc.documentDate}</p>
                      )}
                      {doc.description && (
                        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                          {doc.description}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {doc.fileUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs gap-1.5"
                            onClick={() => openAttachment(doc.fileUrl!)}
                          >
                            <Download className="h-3 w-3" />
                            Open / Download
                          </Button>
                        )}

                        {isUploading ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {uploadProgress}
                          </span>
                        ) : doc.fileUrl ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                            onClick={() => setRemoveAttachDoc(doc)}
                          >
                            <X className="h-3 w-3" />
                            Remove attachment
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                            onClick={() => triggerUpload(doc.id)}
                          >
                            <Upload className="h-3 w-3" />
                            Attach file
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(doc)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteDoc(doc)}
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

      {/* Add / Edit Dialog */}
      <Dialog open={addOpen || !!editDoc} onOpenChange={(open) => { if (!open) closeAll(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editDoc ? "Edit Historical Document" : "Add Historical Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={300}
                placeholder="e.g., Lodge Charter"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Category
              </label>
              <div className="flex gap-2 flex-wrap mb-1.5">
                {SUGGESTED_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: f.category === cat ? "" : cat }))}
                    className={cn(
                      "px-2.5 py-1 rounded-sm text-xs border transition-colors",
                      form.category === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:bg-accent"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                maxLength={100}
                placeholder="Or type a custom category…"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Date / Era
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.documentDate}
                onChange={(e) => setForm((f) => ({ ...f, documentDate: e.target.value }))}
                maxLength={100}
                placeholder="e.g., 1952, circa 1960s, March 1978"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Description
              </label>
              <textarea
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={5000}
                placeholder="Notes about provenance, contents, or significance…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAll} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={editDoc ? handleSaveEdit : handleSaveAdd} disabled={!formValid || isSaving}>
              {isSaving ? "Saving…" : editDoc ? "Save Changes" : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteDoc} onOpenChange={(open) => { if (!open) setDeleteDoc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Remove{" "}
            <span className="font-medium text-foreground">"{deleteDoc?.title}"</span>{" "}
            from the registry? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDoc(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Attachment Confirm */}
      <Dialog open={!!removeAttachDoc} onOpenChange={(open) => { if (!open) setRemoveAttachDoc(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Attachment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Remove the attached file from{" "}
            <span className="font-medium text-foreground">"{removeAttachDoc?.title}"</span>?
            The document record will remain.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoveAttachDoc(null)} disabled={removeAttachment.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveAttachment} disabled={removeAttachment.isPending}>
              {removeAttachment.isPending ? "Removing…" : "Remove Attachment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminHistoryLayout>
  );
}
