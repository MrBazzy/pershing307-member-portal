import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useListLodgeYears,
  useGetActiveLodgeYear,
  useCreateLodgeYear,
  useUpdateLodgeYear,
  useDeleteLodgeYear,
  useActivateLodgeYear,
  useArchiveLodgeYear,
  useListTracingBoardEntries,
  useCreateTracingBoardEntry,
  useUpdateTracingBoardEntry,
  useDeleteTracingBoardEntry,
  useListTracingBoardCategories,
  useCreateTracingBoardCategory,
  useUpdateTracingBoardCategory,
  useDeleteTracingBoardCategory,
  getListLodgeYearsQueryKey,
  getGetActiveLodgeYearQueryKey,
  getListTracingBoardEntriesQueryKey,
  getListTracingBoardCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { BookOpen, Plus, Pencil, Trash2, CheckCircle, Archive, Calendar, Tag } from "lucide-react";

const VISIBILITY_OPTIONS = [
  { value: "members", label: "All Members" },
  { value: "ea_plus", label: "EA+ (Entered Apprentice and above)" },
  { value: "fc_plus", label: "FC+ (Fellowcraft and above)" },
  { value: "mm_only", label: "MM Only (Master Mason)" },
  { value: "officers", label: "Officers" },
  { value: "past_masters", label: "Past Masters" },
] as const;

type VisibilityValue = (typeof VISIBILITY_OPTIONS)[number]["value"];

type TabKey = "entries" | "categories" | "years";

interface LodgeYear { id: string; title: string; startYear: number; endYear: number; status: string; createdAt: string; updatedAt: string; }
interface TBEntry { id: string; lodgeYearId: string; title: string; date: string; startTime: string | null; endTime: string | null; location: string | null; description: string | null; categoryId: string | null; categoryName: string | null; visibility: string; createdAt: string; updatedAt: string; }
interface TBCategory { id: string; name: string; slug: string; sortOrder: number; isSystem: boolean; isActive: boolean; createdAt: string; updatedAt: string; }

const YEAR_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  active: { label: "Active", cls: "bg-green-100 text-green-700 border-green-200" },
  archived: { label: "Archived", cls: "bg-amber-100 text-amber-700 border-amber-200" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = YEAR_STATUS_CONFIG[status] ?? YEAR_STATUS_CONFIG["draft"];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export default function AdminTracingBoardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.roles?.some((r) => r.permissionLevel >= 80) ?? false;
  if (!isAdmin) { setLocation("/dashboard"); return null; }

  const [tab, setTab] = useState<TabKey>("entries");
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  const { data: yearsData, isLoading: yearsLoading } = useListLodgeYears();
  const { data: activeData } = useGetActiveLodgeYear();
  const years = (yearsData?.years ?? []) as LodgeYear[];
  const activeYearId = activeData?.year?.id ?? null;
  const effectiveYearId = selectedYearId ?? activeYearId ?? years[0]?.id ?? null;

  const { data: entriesData, isLoading: entriesLoading } = useListTracingBoardEntries(
    effectiveYearId ? { lodgeYearId: effectiveYearId } : {}
  );
  const entries = (entriesData?.entries ?? []) as TBEntry[];

  const { data: catsData, isLoading: catsLoading } = useListTracingBoardCategories();
  const categories = (catsData?.categories ?? []) as TBCategory[];

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListTracingBoardEntriesQueryKey() });
    qc.invalidateQueries({ queryKey: getListLodgeYearsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetActiveLodgeYearQueryKey() });
  };

  const createYear = useCreateLodgeYear();
  const updateYear = useUpdateLodgeYear();
  const deleteYear = useDeleteLodgeYear();
  const activateYear = useActivateLodgeYear();
  const archiveYear = useArchiveLodgeYear();

  const createEntry = useCreateTracingBoardEntry();
  const updateEntry = useUpdateTracingBoardEntry();
  const deleteEntry = useDeleteTracingBoardEntry();

  const createCat = useCreateTracingBoardCategory();
  const updateCat = useUpdateTracingBoardCategory();
  const deleteCat = useDeleteTracingBoardCategory();

  const [yearDialog, setYearDialog] = useState<"create" | "edit" | null>(null);
  const [editingYear, setEditingYear] = useState<LodgeYear | null>(null);
  const [yearForm, setYearForm] = useState({ title: "", startYear: new Date().getFullYear(), endYear: new Date().getFullYear() + 1 });

  const [entryDialog, setEntryDialog] = useState<"create" | "edit" | null>(null);
  const [editingEntry, setEditingEntry] = useState<TBEntry | null>(null);
  const [entryForm, setEntryForm] = useState({ title: "", date: "", startTime: "", endTime: "", location: "", description: "", categoryId: "", visibility: "members" as VisibilityValue });

  const [catDialog, setCatDialog] = useState<"create" | "edit" | null>(null);
  const [editingCat, setEditingCat] = useState<TBCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: "" });

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "entry" | "category" | "year"; id: string; title: string } | null>(null);

  function openCreateYear() {
    setYearForm({ title: "", startYear: new Date().getFullYear(), endYear: new Date().getFullYear() + 1 });
    setEditingYear(null);
    setYearDialog("create");
  }
  function openEditYear(y: LodgeYear) {
    setYearForm({ title: y.title, startYear: y.startYear, endYear: y.endYear });
    setEditingYear(y);
    setYearDialog("edit");
  }
  function openCreateEntry() {
    setEntryForm({ title: "", date: "", startTime: "", endTime: "", location: "", description: "", categoryId: "", visibility: "members" });
    setEditingEntry(null);
    setEntryDialog("create");
  }
  function openEditEntry(e: TBEntry) {
    setEntryForm({ title: e.title, date: e.date, startTime: e.startTime ?? "", endTime: e.endTime ?? "", location: e.location ?? "", description: e.description ?? "", categoryId: e.categoryId ?? "", visibility: (e.visibility as VisibilityValue) ?? "members" });
    setEditingEntry(e);
    setEntryDialog("edit");
  }
  function openCreateCat() {
    setCatForm({ name: "" });
    setEditingCat(null);
    setCatDialog("create");
  }
  function openEditCat(c: TBCategory) {
    setCatForm({ name: c.name });
    setEditingCat(c);
    setCatDialog("edit");
  }

  async function saveYear() {
    const data = { title: yearForm.title, startYear: yearForm.startYear, endYear: yearForm.endYear };
    if (yearDialog === "create") {
      createYear.mutate({ data }, {
        onSuccess: () => { toast({ title: "Lodge year created" }); invalidateAll(); setYearDialog(null); },
        onError: () => toast({ title: "Failed to create lodge year", variant: "destructive" }),
      });
    } else if (editingYear) {
      updateYear.mutate({ id: editingYear.id, data }, {
        onSuccess: () => { toast({ title: "Lodge year updated" }); invalidateAll(); setYearDialog(null); },
        onError: () => toast({ title: "Failed to update lodge year", variant: "destructive" }),
      });
    }
  }

  async function saveEntry() {
    const data = {
      lodgeYearId: effectiveYearId!,
      title: entryForm.title,
      date: entryForm.date,
      startTime: entryForm.startTime || null,
      endTime: entryForm.endTime || null,
      location: entryForm.location || null,
      description: entryForm.description || null,
      categoryId: entryForm.categoryId || null,
      visibility: entryForm.visibility,
    };
    if (entryDialog === "create") {
      createEntry.mutate({ data }, {
        onSuccess: () => { toast({ title: "Entry created" }); qc.invalidateQueries({ queryKey: getListTracingBoardEntriesQueryKey() }); setEntryDialog(null); },
        onError: () => toast({ title: "Failed to create entry", variant: "destructive" }),
      });
    } else if (editingEntry) {
      updateEntry.mutate({ id: editingEntry.id, data }, {
        onSuccess: () => { toast({ title: "Entry updated" }); qc.invalidateQueries({ queryKey: getListTracingBoardEntriesQueryKey() }); setEntryDialog(null); },
        onError: () => toast({ title: "Failed to update entry", variant: "destructive" }),
      });
    }
  }

  async function saveCat() {
    if (catDialog === "create") {
      createCat.mutate({ data: { name: catForm.name } }, {
        onSuccess: () => { toast({ title: "Category created" }); qc.invalidateQueries({ queryKey: getListTracingBoardCategoriesQueryKey() }); setCatDialog(null); },
        onError: () => toast({ title: "Failed to create category", variant: "destructive" }),
      });
    } else if (editingCat) {
      updateCat.mutate({ id: editingCat.id, data: { name: catForm.name } }, {
        onSuccess: () => { toast({ title: "Category updated" }); qc.invalidateQueries({ queryKey: getListTracingBoardCategoriesQueryKey() }); setCatDialog(null); },
        onError: () => toast({ title: "Failed to update category", variant: "destructive" }),
      });
    }
  }

  function confirmDelete(type: "entry" | "category" | "year", id: string, title: string) {
    setDeleteConfirm({ type, id, title });
  }

  async function executeDelete() {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    if (type === "entry") {
      deleteEntry.mutate({ id }, {
        onSuccess: () => { toast({ title: "Entry deleted" }); qc.invalidateQueries({ queryKey: getListTracingBoardEntriesQueryKey() }); },
        onError: () => toast({ title: "Failed to delete entry", variant: "destructive" }),
      });
    } else if (type === "category") {
      deleteCat.mutate({ id }, {
        onSuccess: () => { toast({ title: "Category deleted" }); qc.invalidateQueries({ queryKey: getListTracingBoardCategoriesQueryKey() }); },
        onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
      });
    } else {
      deleteYear.mutate({ id }, {
        onSuccess: () => { toast({ title: "Lodge year deleted" }); invalidateAll(); },
        onError: (e: any) => toast({ title: e?.data?.error ?? "Failed to delete", variant: "destructive" }),
      });
    }
    setDeleteConfirm(null);
  }

  const activeCats = categories.filter((c) => c.isActive);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Tracing Board</h1>
            <p className="text-sm text-muted-foreground">Manage the lodge year programme</p>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {(["entries", "categories", "years"] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-${t}`}
            >
              {t === "years" ? "Lodge Years" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "entries" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Year:</label>
                <select
                  value={effectiveYearId ?? ""}
                  onChange={(e) => setSelectedYearId(e.target.value || null)}
                  className="text-sm border border-border rounded-sm px-2 py-1 bg-background"
                  data-testid="year-select"
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.title} {y.status === "active" ? "(Active)" : y.status === "archived" ? "(Archived)" : "(Draft)"}
                    </option>
                  ))}
                </select>
              </div>
              {effectiveYearId && (
                <Button size="sm" onClick={openCreateEntry} data-testid="button-add-entry">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Entry
                </Button>
              )}
            </div>

            {!effectiveYearId ? (
              <Card className="border-card-border">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Create a lodge year first to add entries.
                </CardContent>
              </Card>
            ) : entriesLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : entries.length === 0 ? (
              <Card className="border-card-border">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No entries yet. Click "Add Entry" to get started.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-card-border">
                <div className="divide-y divide-border">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{entry.title}</span>
                          {entry.categoryName && (
                            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">{entry.categoryName}</span>
                          )}
                          <span className="text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded">{VISIBILITY_OPTIONS.find((v) => v.value === entry.visibility)?.label ?? entry.visibility}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.date}{entry.startTime ? ` · ${entry.startTime}` : ""}{entry.location ? ` · ${entry.location}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEntry(entry)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => confirmDelete("entry", entry.id, entry.title)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "categories" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreateCat} data-testid="button-add-category">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Category
              </Button>
            </div>
            {catsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Card className="border-card-border">
                <div className="divide-y divide-border">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-foreground">{cat.name}</span>
                        {cat.isSystem && <span className="text-[10px] text-muted-foreground">(system)</span>}
                        {!cat.isActive && <span className="text-[10px] text-muted-foreground opacity-60">(inactive)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCat(cat)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!cat.isSystem && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => confirmDelete("category", cat.id, cat.name)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "years" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreateYear} data-testid="button-add-year">
                <Plus className="h-4 w-4 mr-1.5" />
                New Lodge Year
              </Button>
            </div>
            {yearsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : years.length === 0 ? (
              <Card className="border-card-border">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No lodge years yet. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-card-border">
                <div className="divide-y divide-border">
                  {years.map((year) => (
                    <div key={year.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{year.title}</span>
                          <StatusBadge status={year.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">{year.startYear} – {year.endYear}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {year.status !== "active" && year.status !== "archived" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => activateYear.mutate({ id: year.id }, { onSuccess: () => { toast({ title: `${year.title} activated` }); invalidateAll(); }, onError: () => toast({ title: "Failed to activate", variant: "destructive" }) })}>
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Activate
                          </Button>
                        )}
                        {year.status === "active" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => archiveYear.mutate({ id: year.id }, { onSuccess: () => { toast({ title: `${year.title} archived` }); invalidateAll(); }, onError: () => toast({ title: "Failed to archive", variant: "destructive" }) })}>
                            <Archive className="h-3.5 w-3.5 mr-1" />
                            Archive
                          </Button>
                        )}
                        {year.status !== "archived" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditYear(year)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {year.status === "draft" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => confirmDelete("year", year.id, year.title)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!yearDialog} onOpenChange={(o) => { if (!o) setYearDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{yearDialog === "create" ? "New Lodge Year" : "Edit Lodge Year"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" placeholder="e.g. 2025-2026" value={yearForm.title} onChange={(e) => setYearForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Year</label>
                <input type="number" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={yearForm.startYear} onChange={(e) => setYearForm((f) => ({ ...f, startYear: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Year</label>
                <input type="number" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={yearForm.endYear} onChange={(e) => setYearForm((f) => ({ ...f, endYear: parseInt(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYearDialog(null)}>Cancel</Button>
            <Button onClick={saveYear} disabled={!yearForm.title || createYear.isPending || updateYear.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!entryDialog} onOpenChange={(o) => { if (!o) setEntryDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{entryDialog === "create" ? "Add Entry" : "Edit Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.title} onChange={(e) => setEntryForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date *</label>
              <input type="date" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Time</label>
                <input type="time" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.startTime} onChange={(e) => setEntryForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Time</label>
                <input type="time" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.endTime} onChange={(e) => setEntryForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Location</label>
              <input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.location} onChange={(e) => setEntryForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <select className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.categoryId} onChange={(e) => setEntryForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">— None —</option>
                {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Visibility</label>
              <select className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={entryForm.visibility} onChange={(e) => setEntryForm((f) => ({ ...f, visibility: e.target.value as VisibilityValue }))}>
                {VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <textarea rows={3} className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background resize-y" value={entryForm.description} onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialog(null)}>Cancel</Button>
            <Button onClick={saveEntry} disabled={!entryForm.title || !entryForm.date || createEntry.isPending || updateEntry.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!catDialog} onOpenChange={(o) => { if (!o) setCatDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catDialog === "create" ? "New Category" : "Edit Category"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">Name</label>
            <input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={catForm.name} onChange={(e) => setCatForm({ name: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>Cancel</Button>
            <Button onClick={saveCat} disabled={!catForm.name || createCat.isPending || updateCat.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Delete <span className="font-medium text-foreground">{deleteConfirm?.title}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={executeDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
