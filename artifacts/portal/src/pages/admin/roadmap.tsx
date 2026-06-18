import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useListRoadmapItems,
  useCreateRoadmapItem,
  useUpdateRoadmapItem,
  useDeleteRoadmapItem,
  useReorderRoadmapItems,
  getListRoadmapItemsQueryKey,
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
import { Map, Plus, Pencil, Trash2, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";

type RoadmapStatus = "planned" | "in-progress" | "completed" | "future-idea";

interface RoadmapItemData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sortOrder: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS: { value: RoadmapStatus; label: string }[] = [
  { value: "planned",     label: "Planned" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "future-idea", label: "Future Idea" },
];

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  "planned":     { label: "Planned",     cls: "bg-gray-100 text-gray-700 border-gray-200" },
  "in-progress": { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  "completed":   { label: "Completed",   cls: "bg-green-100 text-green-700 border-green-200" },
  "future-idea": { label: "Future Idea", cls: "bg-purple-100 text-purple-700 border-purple-200" },
};

interface ItemFormState {
  title: string;
  description: string;
  status: RoadmapStatus;
}

const defaultForm: ItemFormState = { title: "", description: "", status: "planned" };

export default function AdminRoadmapPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = user?.roles?.some((r) => r.permissionLevel >= 80) ?? false;
  if (!isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  const { data, isLoading } = useListRoadmapItems();
  const items: RoadmapItemData[] = (data?.items ?? []) as RoadmapItemData[];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItemData | null>(null);
  const [form, setForm] = useState<ItemFormState>(defaultForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListRoadmapItemsQueryKey() });

  const createMutation = useCreateRoadmapItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        toast({ title: "Item created" });
      },
      onError: () => toast({ title: "Failed to create item", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateRoadmapItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        toast({ title: "Item updated" });
      },
      onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteRoadmapItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteConfirmId(null);
        toast({ title: "Item deleted" });
      },
      onError: () => toast({ title: "Failed to delete item", variant: "destructive" }),
    },
  });

  const reorderMutation = useReorderRoadmapItems({
    mutation: {
      onSuccess: invalidate,
      onError: () => toast({ title: "Failed to reorder", variant: "destructive" }),
    },
  });

  const toggleVisibility = (item: RoadmapItemData) => {
    updateMutation.mutate({
      id: item.id,
      data: { isVisible: !item.isVisible },
    });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;

    const updated = sorted.map((item, i) => {
      if (i === index) return { id: item.id, sortOrder: sorted[target].sortOrder };
      if (i === target) return { id: item.id, sortOrder: sorted[index].sortOrder };
      return { id: item.id, sortOrder: item.sortOrder };
    });

    reorderMutation.mutate({ data: { items: updated } });
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (item: RoadmapItemData) => {
    setEditingItem(item);
    setForm({ title: item.title, description: item.description ?? "", status: item.status as RoadmapStatus });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        data: { title: form.title.trim(), description: form.description.trim() || null, status: form.status },
      });
    } else {
      createMutation.mutate({
        data: { title: form.title.trim(), description: form.description.trim() || null, status: form.status },
      });
    }
  };

  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-semibold text-primary flex items-center gap-2">
              <Map className="h-6 w-6 text-muted-foreground" />
              Roadmap
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage upcoming features shown to all members
            </p>
          </div>
          <Button onClick={openCreate} size="sm" data-testid="button-add-roadmap-item">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </Button>
        </div>

        <Card className="border-card-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y divide-border">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 flex items-center gap-3">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 flex-1" />
                  </div>
                ))}
              </div>
            ) : sorted.length > 0 ? (
              <div className="divide-y divide-border">
                {sorted.map((item, idx) => {
                  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG["planned"];
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-4 ${!item.isVisible ? "opacity-50" : ""}`}
                      data-testid={`roadmap-item-${item.id}`}
                    >
                      {/* Reorder arrows */}
                      <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                        <button
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0 || reorderMutation.isPending}
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveItem(idx, 1)}
                          disabled={idx === sorted.length - 1 || reorderMutation.isPending}
                          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Status badge */}
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 mt-0.5 ${cfg.cls}`}>
                        {cfg.label}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                        )}
                        {!item.isVisible && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                            <EyeOff className="h-3 w-3" /> Hidden from members
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleVisibility(item)}
                          disabled={updateMutation.isPending}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent transition-colors"
                          aria-label={item.isVisible ? "Hide from members" : "Show to members"}
                          title={item.isVisible ? "Hide from members" : "Show to members"}
                        >
                          {item.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent transition-colors"
                          aria-label="Edit"
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-sm hover:bg-destructive/10 transition-colors"
                          aria-label="Delete"
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <Map className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No roadmap items yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Add items to show members what features are coming
                </p>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add First Item
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit Item" : "Add Roadmap Item"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="roadmap-title">
                  Title <span className="text-destructive">*</span>
                </label>
                <input
                  id="roadmap-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  required
                  className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Lodge Document Library"
                  data-testid="input-roadmap-title"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="roadmap-description">
                  Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="roadmap-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={5000}
                  rows={6}
                  className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  placeholder="Describe what this feature will deliver, implementation notes, and any relevant details..."
                  data-testid="input-roadmap-description"
                />
                <p className="text-[11px] text-muted-foreground text-right">
                  {form.description.length}/5000
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="roadmap-status">
                  Status
                </label>
                <select
                  id="roadmap-status"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as RoadmapStatus }))}
                  className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="select-roadmap-status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || !form.title.trim()} data-testid="button-save-roadmap-item">
                  {isSaving ? "Saving…" : editingItem ? "Save Changes" : "Add Item"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Roadmap Item</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently remove this item from the roadmap. This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (deleteConfirmId) deleteMutation.mutate({ id: deleteConfirmId });
                }}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
