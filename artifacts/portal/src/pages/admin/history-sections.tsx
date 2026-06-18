import { useState } from "react";
import {
  useListHistorySections,
  useCreateHistorySection,
  useUpdateHistorySection,
  useDeleteHistorySection,
  useReorderHistorySections,
  getListHistorySectionsQueryKey,
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
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Landmark } from "lucide-react";

interface Section {
  id: string;
  yearPeriod: string;
  chapterTitle: string;
  bodyText: string;
  sortOrder: number;
}

interface SectionForm {
  yearPeriod: string;
  chapterTitle: string;
  bodyText: string;
}

const emptyForm: SectionForm = { yearPeriod: "", chapterTitle: "", bodyText: "" };

export default function AdminHistorySectionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListHistorySections();
  const create = useCreateHistorySection();
  const update = useUpdateHistorySection();
  const remove = useDeleteHistorySection();
  const reorder = useReorderHistorySections();

  const [addOpen, setAddOpen] = useState(false);
  const [editSection, setEditSection] = useState<Section | null>(null);
  const [deleteSection, setDeleteSection] = useState<Section | null>(null);
  const [form, setForm] = useState<SectionForm>(emptyForm);

  const sections = (data?.sections ?? []) as Section[];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListHistorySectionsQueryKey() });
  }

  function openAdd() {
    setForm(emptyForm);
    setAddOpen(true);
  }

  function openEdit(s: Section) {
    setForm({ yearPeriod: s.yearPeriod, chapterTitle: s.chapterTitle, bodyText: s.bodyText });
    setEditSection(s);
  }

  function closeAll() {
    setAddOpen(false);
    setEditSection(null);
    setDeleteSection(null);
    setForm(emptyForm);
  }

  const formValid = form.yearPeriod.trim().length > 0 && form.chapterTitle.trim().length > 0;
  const isSaving = create.isPending || update.isPending;

  function handleSaveAdd() {
    create.mutate(
      { data: { yearPeriod: form.yearPeriod.trim(), chapterTitle: form.chapterTitle.trim(), bodyText: form.bodyText, sortOrder: sections.length } },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Section added" }); },
        onError: () => toast({ title: "Failed to add section", variant: "destructive" }),
      }
    );
  }

  function handleSaveEdit() {
    if (!editSection) return;
    update.mutate(
      { id: editSection.id, data: { yearPeriod: form.yearPeriod.trim(), chapterTitle: form.chapterTitle.trim(), bodyText: form.bodyText } },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Section updated" }); },
        onError: () => toast({ title: "Failed to update section", variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    if (!deleteSection) return;
    remove.mutate(
      { id: deleteSection.id },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Section removed" }); },
        onError: () => toast({ title: "Failed to remove section", variant: "destructive" }),
      }
    );
  }

  function handleMove(idx: number, direction: "up" | "down") {
    const newOrder = [...sections];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    reorder.mutate(
      { data: { orderedIds: newOrder.map((s) => s.id) } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
      }
    );
  }

  return (
    <AdminHistoryLayout>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Add and manage Our History chapters. Use the arrows to set the reading order.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Section
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-card-border">
              <CardContent className="py-4 flex gap-4">
                <Skeleton className="h-10 w-16 shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="py-14 text-center">
            <Landmark className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No sections yet. Click "Add Section" to write the first chapter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sections.map((section, idx) => (
            <Card key={section.id} className="border-card-border">
              <CardContent className="py-3.5 px-4">
                <div className="flex items-start gap-3">
                  {/* Reorder arrows */}
                  <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleMove(idx, "up")}
                      disabled={idx === 0 || reorder.isPending}
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleMove(idx, "down")}
                      disabled={idx === sections.length - 1 || reorder.isPending}
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Year badge */}
                  <div className="shrink-0 mt-0.5">
                    <span className="inline-block text-[10px] font-bold text-sidebar-active bg-sidebar-active/10 border border-sidebar-active/30 px-2 py-1 rounded-sm tracking-wider whitespace-nowrap">
                      {section.yearPeriod}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground font-serif leading-snug">
                      {section.chapterTitle}
                    </h3>
                    {section.bodyText && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {section.bodyText}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEdit(section)}
                      title="Edit section"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteSection(section)}
                      title="Delete section"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={addOpen || !!editSection} onOpenChange={(open) => { if (!open) closeAll(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editSection ? "Edit History Section" : "Add History Section"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Year / Period <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.yearPeriod}
                onChange={(e) => setForm((f) => ({ ...f, yearPeriod: e.target.value }))}
                maxLength={100}
                placeholder="e.g. 1959, 2009–2012, 1959 – Present"
              />
              <p className="text-[11px] text-muted-foreground">
                Shown as a gold badge before the chapter title.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Chapter Title <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.chapterTitle}
                onChange={(e) => setForm((f) => ({ ...f, chapterTitle: e.target.value }))}
                maxLength={300}
                placeholder="e.g. Origins in NATO Europe"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Body Text
              </label>
              <textarea
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[200px] leading-relaxed"
                value={form.bodyText}
                onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                maxLength={20000}
                placeholder="Paste or type the section text. Use double line breaks to separate paragraphs."
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {form.bodyText.length.toLocaleString()} / 20,000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAll} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={editSection ? handleSaveEdit : handleSaveAdd} disabled={!formValid || isSaving}>
              {isSaving ? "Saving…" : editSection ? "Save Changes" : "Add Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteSection} onOpenChange={(open) => { if (!open) setDeleteSection(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Section</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Permanently remove{" "}
            <span className="font-medium text-foreground">
              "{deleteSection?.chapterTitle}"
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteSection(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminHistoryLayout>
  );
}
