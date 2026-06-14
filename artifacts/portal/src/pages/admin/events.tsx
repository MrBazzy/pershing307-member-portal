import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useListEventCategories,
  useCreateEventCategory,
  useUpdateEventCategory,
  useDeleteEventCategory,
  useReorderEventCategories,
  getListEventsQueryKey,
  getListEventCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
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
import { CalendarDays, Plus, Pencil, Trash2, Tag, ChevronUp, ChevronDown, EyeOff } from "lucide-react";

const VISIBILITY_OPTIONS = [
  { value: "members", label: "All Members" },
  { value: "ea_plus", label: "EA+ (Entered Apprentice and above)" },
  { value: "fc_plus", label: "FC+ (Fellowcraft and above)" },
  { value: "mm_only", label: "MM Only (Master Mason)" },
  { value: "officers", label: "Officers" },
  { value: "past_masters", label: "Past Masters" },
] as const;

type VisibilityValue = (typeof VISIBILITY_OPTIONS)[number]["value"];
type TabKey = "events" | "categories";

interface EventItem { id: string; title: string; description: string | null; date: string; startTime: string | null; endTime: string | null; categoryId: string | null; categoryName: string | null; visibility: string; organizerId: string | null; location: string | null; createdBy: string | null; lastModifiedBy: string | null; createdAt: string; updatedAt: string; }
interface EventCat { id: string; name: string; slug: string; description: string | null; sortOrder: number; isSystem: boolean; isActive: boolean; createdBy: string | null; lastModifiedBy: string | null; createdAt: string; updatedAt: string; }

export default function AdminEventsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.roles?.some((r) => r.permissionLevel >= 80) ?? false;
  if (!isAdmin) { setLocation("/dashboard"); return null; }

  const [tab, setTab] = useState<TabKey>("events");

  const { data: eventsData, isLoading: eventsLoading } = useListEvents({});
  const events = (eventsData?.events ?? []) as EventItem[];

  const { data: catsData, isLoading: catsLoading } = useListEventCategories();
  const categories = (catsData?.categories ?? []) as EventCat[];

  const invalidateCats = () => qc.invalidateQueries({ queryKey: getListEventCategoriesQueryKey() });

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const createCat = useCreateEventCategory();
  const updateCat = useUpdateEventCategory();
  const deleteCat = useDeleteEventCategory();
  const reorderCats = useReorderEventCategories();

  const [eventDialog, setEventDialog] = useState<"create" | "edit" | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [eventForm, setEventForm] = useState({ title: "", description: "", date: "", startTime: "", endTime: "", location: "", categoryId: "", visibility: "members" as VisibilityValue });

  const [catDialog, setCatDialog] = useState<"create" | "edit" | null>(null);
  const [editingCat, setEditingCat] = useState<EventCat | null>(null);
  const [catForm, setCatForm] = useState({ name: "", description: "" });

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "event" | "category"; id: string; title: string } | null>(null);

  function openCreateEvent() { setEventForm({ title: "", description: "", date: "", startTime: "", endTime: "", location: "", categoryId: "", visibility: "members" }); setEditingEvent(null); setEventDialog("create"); }
  function openEditEvent(e: EventItem) { setEventForm({ title: e.title, description: e.description ?? "", date: e.date, startTime: e.startTime ?? "", endTime: e.endTime ?? "", location: e.location ?? "", categoryId: e.categoryId ?? "", visibility: (e.visibility as VisibilityValue) ?? "members" }); setEditingEvent(e); setEventDialog("edit"); }
  function openCreateCat() { setCatForm({ name: "", description: "" }); setEditingCat(null); setCatDialog("create"); }
  function openEditCat(c: EventCat) { setCatForm({ name: c.name, description: c.description ?? "" }); setEditingCat(c); setCatDialog("edit"); }

  async function saveEvent() {
    const data = { title: eventForm.title, description: eventForm.description || null, date: eventForm.date, startTime: eventForm.startTime || null, endTime: eventForm.endTime || null, location: eventForm.location || null, categoryId: eventForm.categoryId || null, visibility: eventForm.visibility };
    if (eventDialog === "create") {
      createEvent.mutate({ data }, { onSuccess: () => { toast({ title: "Event created" }); qc.invalidateQueries({ queryKey: getListEventsQueryKey() }); setEventDialog(null); }, onError: () => toast({ title: "Failed to create event", variant: "destructive" }) });
    } else if (editingEvent) {
      updateEvent.mutate({ id: editingEvent.id, data }, { onSuccess: () => { toast({ title: "Event updated" }); qc.invalidateQueries({ queryKey: getListEventsQueryKey() }); setEventDialog(null); }, onError: () => toast({ title: "Failed to update event", variant: "destructive" }) });
    }
  }

  async function saveCat() {
    const data = { name: catForm.name, description: catForm.description || null };
    if (catDialog === "create") {
      createCat.mutate({ data }, { onSuccess: () => { toast({ title: "Category created" }); invalidateCats(); setCatDialog(null); }, onError: () => toast({ title: "Failed to create category", variant: "destructive" }) });
    } else if (editingCat) {
      updateCat.mutate({ id: editingCat.id, data }, { onSuccess: () => { toast({ title: "Category updated" }); invalidateCats(); setCatDialog(null); }, onError: () => toast({ title: "Failed to update category", variant: "destructive" }) });
    }
  }

  async function toggleDisable(cat: EventCat) {
    updateCat.mutate({ id: cat.id, data: { isActive: !cat.isActive } }, {
      onSuccess: () => { toast({ title: cat.isActive ? "Category disabled" : "Category enabled" }); invalidateCats(); },
      onError: () => toast({ title: "Failed to update category", variant: "destructive" }),
    });
  }

  async function executeDelete() {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    if (type === "event") {
      deleteEvent.mutate({ id }, { onSuccess: () => { toast({ title: "Event deleted" }); qc.invalidateQueries({ queryKey: getListEventsQueryKey() }); }, onError: () => toast({ title: "Failed to delete event", variant: "destructive" }) });
    } else {
      deleteCat.mutate({ id }, {
        onSuccess: () => { toast({ title: "Category deleted" }); invalidateCats(); },
        onError: (e: any) => {
          if (e?.status === 409) {
            toast({ title: `Cannot delete: category is used by ${e?.data?.inUseCount ?? "some"} events. Disable it instead.`, variant: "destructive", duration: 6000 });
          } else {
            toast({ title: "Failed to delete category", variant: "destructive" });
          }
        },
      });
    }
    setDeleteConfirm(null);
  }

  function moveCat(catId: string, direction: "up" | "down") {
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((c) => c.id === catId);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === sorted.length - 1)) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const items = [
      { id: sorted[idx].id, sortOrder: sorted[swapIdx].sortOrder },
      { id: sorted[swapIdx].id, sortOrder: sorted[idx].sortOrder },
    ];
    reorderCats.mutate({ data: { items } }, { onSuccess: () => invalidateCats(), onError: () => toast({ title: "Failed to reorder", variant: "destructive" }) });
  }

  const activeCats = categories.filter((c) => c.isActive);
  const sortedCats = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Events</h1>
            <p className="text-sm text-muted-foreground">Manage lodge events</p>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border">
          {(["events", "categories"] as TabKey[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} data-testid={`tab-${t}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "events" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreateEvent} data-testid="button-add-event"><Plus className="h-4 w-4 mr-1.5" />Add Event</Button>
            </div>
            {eventsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : events.length === 0 ? (
              <Card className="border-card-border"><CardContent className="py-12 text-center text-sm text-muted-foreground">No events yet. Click "Add Event" to create the first one.</CardContent></Card>
            ) : (
              <Card className="border-card-border">
                <div className="divide-y divide-border">
                  {events.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{event.title}</span>
                          {event.categoryName && <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">{event.categoryName}</span>}
                          <span className="text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded">{VISIBILITY_OPTIONS.find((v) => v.value === event.visibility)?.label ?? event.visibility}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{event.date}{event.startTime ? ` · ${event.startTime}` : ""}{event.location ? ` · ${event.location}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEvent(event)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm({ type: "event", id: event.id, title: event.title })}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Drag or use arrows to reorder. Disabled categories are hidden from members.</p>
              <Button size="sm" onClick={openCreateCat} data-testid="button-add-category"><Plus className="h-4 w-4 mr-1.5" />Add Category</Button>
            </div>
            {catsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <Card className="border-card-border">
                <div className="divide-y divide-border">
                  {sortedCats.map((cat, idx) => (
                    <div key={cat.id} className={`flex items-center gap-3 px-4 py-2.5 ${!cat.isActive ? "opacity-50" : ""}`}>
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveCat(cat.id, "up")} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-opacity"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => moveCat(cat.id, "down")} disabled={idx === sortedCats.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-opacity"><ChevronDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground font-medium">{cat.name}</span>
                          {cat.isSystem && <span className="text-[10px] text-muted-foreground border border-border px-1 py-0.5 rounded">system</span>}
                          {!cat.isActive && <span className="text-[10px] text-muted-foreground">disabled</span>}
                        </div>
                        {cat.description && <p className="text-xs text-muted-foreground truncate">{cat.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCat(cat)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className={`h-7 w-7 ${cat.isActive ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`} onClick={() => toggleDisable(cat)} title={cat.isActive ? "Disable" : "Enable"}>
                          <EyeOff className="h-3.5 w-3.5" />
                        </Button>
                        {!cat.isSystem && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm({ type: "category", id: cat.id, title: cat.name })} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
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

      <Dialog open={!!eventDialog} onOpenChange={(o) => { if (!o) setEventDialog(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{eventDialog === "create" ? "Add Event" : "Edit Event"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium mb-1 block">Title *</label><input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="text-sm font-medium mb-1 block">Date *</label><input type="date" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium mb-1 block">Start Time</label><input type="time" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.startTime} onChange={(e) => setEventForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
              <div><label className="text-sm font-medium mb-1 block">End Time</label><input type="time" className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.endTime} onChange={(e) => setEventForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium mb-1 block">Location</label><input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.location} onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))} /></div>
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <select className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.categoryId} onChange={(e) => setEventForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">— None —</option>
                {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Visibility</label>
              <select className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={eventForm.visibility} onChange={(e) => setEventForm((f) => ({ ...f, visibility: e.target.value as VisibilityValue }))}>
                {VISIBILITY_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="text-sm font-medium mb-1 block">Description</label><textarea rows={3} className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background resize-y" value={eventForm.description} onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventDialog(null)}>Cancel</Button>
            <Button onClick={saveEvent} disabled={!eventForm.title || !eventForm.date || createEvent.isPending || updateEvent.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!catDialog} onOpenChange={(o) => { if (!o) setCatDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{catDialog === "create" ? "New Category" : "Edit Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><label className="text-sm font-medium mb-1 block">Name *</label><input className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background" value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="text-sm font-medium mb-1 block">Description</label><textarea rows={2} className="w-full border border-border rounded-sm px-3 py-1.5 text-sm bg-background resize-y" placeholder="Optional — explains what this category covers" value={catForm.description} onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>Cancel</Button>
            <Button onClick={saveCat} disabled={!catForm.name || createCat.isPending || updateCat.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Delete <span className="font-medium text-foreground">{deleteConfirm?.title}</span>? This cannot be undone.{deleteConfirm?.type === "category" && " If the category is in use, you will be prompted to disable it instead."}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={executeDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
