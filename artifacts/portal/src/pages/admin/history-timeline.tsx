import { useState } from "react";
import {
  useListHistoryTimeline,
  useCreateHistoryTimelineEntry,
  useUpdateHistoryTimelineEntry,
  useDeleteHistoryTimelineEntry,
  getListHistoryTimelineQueryKey,
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
import { Plus, Pencil, Trash2, Clock } from "lucide-react";

const PRESENT_YEAR = 9999;

interface TimelineEntry {
  id: string;
  year: number;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface EntryForm {
  year: string;
  title: string;
  description: string;
  isPresent: boolean;
}

const emptyForm: EntryForm = {
  year: String(new Date().getFullYear()),
  title: "",
  description: "",
  isPresent: false,
};

function displayYear(year: number): string {
  return year === PRESENT_YEAR ? "Present" : String(year);
}

export default function AdminHistoryTimelinePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListHistoryTimeline();
  const create = useCreateHistoryTimelineEntry();
  const update = useUpdateHistoryTimelineEntry();
  const remove = useDeleteHistoryTimelineEntry();

  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimelineEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimelineEntry | null>(null);
  const [form, setForm] = useState<EntryForm>(emptyForm);

  const entries = (data?.entries ?? []) as TimelineEntry[];

  function openAdd() {
    setForm(emptyForm);
    setAddOpen(true);
  }

  function openEdit(entry: TimelineEntry) {
    const isPresent = entry.year === PRESENT_YEAR;
    setForm({
      year: isPresent ? "" : String(entry.year),
      title: entry.title,
      description: entry.description ?? "",
      isPresent,
    });
    setEditEntry(entry);
  }

  function closeAll() {
    setAddOpen(false);
    setEditEntry(null);
    setDeleteEntry(null);
    setForm(emptyForm);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListHistoryTimelineQueryKey() });
  }

  const yearNum = form.isPresent ? PRESENT_YEAR : parseInt(form.year, 10);
  const formValid =
    form.title.trim().length > 0 &&
    (form.isPresent || (!isNaN(yearNum) && yearNum >= 1700 && yearNum <= 9998));

  function handleSaveAdd() {
    create.mutate(
      { data: { year: yearNum, title: form.title.trim(), description: form.description.trim() || null } },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Entry added" }); },
        onError: () => toast({ title: "Failed to add entry", variant: "destructive" }),
      }
    );
  }

  function handleSaveEdit() {
    if (!editEntry) return;
    update.mutate(
      { id: editEntry.id, data: { year: yearNum, title: form.title.trim(), description: form.description.trim() || null } },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Entry updated" }); },
        onError: () => toast({ title: "Failed to update entry", variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    if (!deleteEntry) return;
    remove.mutate(
      { id: deleteEntry.id },
      {
        onSuccess: () => { invalidate(); closeAll(); toast({ title: "Entry removed" }); },
        onError: () => toast({ title: "Failed to delete entry", variant: "destructive" }),
      }
    );
  }

  const isSaving = create.isPending || update.isPending;

  return (
    <AdminHistoryLayout>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Add, edit, and remove timeline entries. Entries are sorted by year.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Entry
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
      ) : entries.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="py-14 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No entries yet. Click "Add Entry" to begin.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-[4.5rem] top-0 bottom-0 w-px bg-border hidden sm:block" />
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-4 items-start">
                <div className="w-16 shrink-0 text-right">
                  <span className="inline-block font-bold text-primary text-sm leading-tight pt-3.5">
                    {displayYear(entry.year)}
                  </span>
                </div>
                <Card className="border-card-border flex-1 sm:ml-4">
                  <CardContent className="py-3.5 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground leading-snug">
                        {entry.title}
                      </h3>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteEntry(entry)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {entry.description && (
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                        {entry.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={addOpen || !!editEntry} onOpenChange={(open) => { if (!open) closeAll(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editEntry ? "Edit Timeline Entry" : "Add Timeline Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <input
                id="is-present"
                type="checkbox"
                checked={form.isPresent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isPresent: e.target.checked, year: e.target.checked ? "" : f.year }))
                }
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <label htmlFor="is-present" className="text-sm text-foreground cursor-pointer">
                Mark as <span className="font-medium">Present</span> (ongoing / current era)
              </label>
            </div>

            {!form.isPresent && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  Year <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  min={1700}
                  max={9998}
                  className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="e.g. 1959"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={300}
                placeholder="e.g., Foundation in Fontainebleau"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Description
              </label>
              <textarea
                className="w-full border border-input rounded-sm px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[160px] leading-relaxed"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={5000}
                placeholder="Paste or type the description. Supports multiple paragraphs and line breaks."
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {form.description.length.toLocaleString()} / 5,000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeAll} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={editEntry ? handleSaveEdit : handleSaveAdd} disabled={!formValid || isSaving}>
              {isSaving ? "Saving…" : editEntry ? "Save Changes" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteEntry} onOpenChange={(open) => { if (!open) setDeleteEntry(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Entry</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Remove{" "}
            <span className="font-medium text-foreground">
              "{deleteEntry?.title}" ({deleteEntry ? displayYear(deleteEntry.year) : ""})
            </span>{" "}
            from the timeline? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteEntry(null)} disabled={remove.isPending}>
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
