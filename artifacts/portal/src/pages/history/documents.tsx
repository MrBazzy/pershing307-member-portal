import { useState } from "react";
import {
  useListHistoryDocuments,
  useCreateHistoryDocument,
  useUpdateHistoryDocument,
  useDeleteHistoryDocument,
  getListHistoryDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { HistoryLayout } from "@/components/history/history-layout";
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
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { ADMIN_LEVEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

function maxLevel(user: ReturnType<typeof useAuth>["user"]): number {
  return user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
}

interface HistoryDoc {
  id: string;
  title: string;
  description: string | null;
  documentDate: string | null;
  category: string | null;
  fileUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
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

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cls = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium border", cls)}>
      {category}
    </span>
  );
}

const SUGGESTED_CATEGORIES = ["Charter", "Petition", "Minutes", "Correspondence", "Photograph", "Certificate", "Other"];

export default function HistoricalDocumentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = maxLevel(user) >= ADMIN_LEVEL;

  const { data, isLoading } = useListHistoryDocuments();
  const create = useCreateHistoryDocument();
  const update = useUpdateHistoryDocument();
  const remove = useDeleteHistoryDocument();

  const [addOpen, setAddOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<HistoryDoc | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<HistoryDoc | null>(null);
  const [form, setForm] = useState<DocForm>(emptyForm);

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

  return (
    <HistoryLayout>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          A registry of significant historical documents associated with the Lodge.
        </p>
        {isAdmin && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Document
          </Button>
        )}
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
              No documents recorded yet.{isAdmin ? " Click \"Add Document\" to begin." : " Check back later."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
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
                  </div>
                  {isAdmin && (
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
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
            Remove <span className="font-medium text-foreground">"{deleteDoc?.title}"</span> from the registry? This cannot be undone.
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
    </HistoryLayout>
  );
}
