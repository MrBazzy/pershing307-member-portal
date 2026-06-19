import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDocumentDomainAccessMatrix,
  useUpdateDocumentDomainAccessMatrix,
  useListDocumentDomains,
  getGetDocumentDomainAccessMatrixQueryKey,
} from "@workspace/api-client-react";
import {
  Shield,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_ROWS = [
  { subjectType: "role" as const, subjectKey: "visitor", label: "Visitor" },
  { subjectType: "role" as const, subjectKey: "member", label: "Member" },
  { subjectType: "role" as const, subjectKey: "secretary", label: "Secretary" },
  { subjectType: "role" as const, subjectKey: "treasurer", label: "Treasurer" },
  { subjectType: "role" as const, subjectKey: "junior-warden", label: "Junior Warden" },
  { subjectType: "role" as const, subjectKey: "senior-warden", label: "Senior Warden" },
  { subjectType: "role" as const, subjectKey: "worshipful-master", label: "Worshipful Master" },
  { subjectType: "role" as const, subjectKey: "past-master", label: "Past Master" },
  { subjectType: "role" as const, subjectKey: "site-administrator", label: "Site Administrator" },
  { subjectType: "role" as const, subjectKey: "pm-super-administrator", label: "PM Super Administrator" },
];

const DEGREE_ROWS = [
  { subjectType: "degree" as const, subjectKey: "1", label: "Entered Apprentice (1°)" },
  { subjectType: "degree" as const, subjectKey: "2", label: "Fellowcraft (2°)" },
  { subjectType: "degree" as const, subjectKey: "3", label: "Master Mason (3°)" },
];

const PERMISSIONS = [
  { key: "view" as const, label: "View" },
  { key: "upload" as const, label: "Upload" },
  { key: "approve" as const, label: "Approve" },
  { key: "manage" as const, label: "Manage" },
];

type PermissionKey = "view" | "upload" | "approve" | "manage";

function matrixToSet(matrix: { subjectType: string; subjectKey: string; permission: string }[]): Set<string> {
  return new Set(matrix.map((e) => `${e.subjectType}:${e.subjectKey}:${e.permission}`));
}

function setToMatrixInput(set: Set<string>) {
  return Array.from(set).map((key) => {
    const [subjectType, subjectKey, permission] = key.split(":");
    return { subjectType: subjectType as "role" | "degree", subjectKey, permission: permission as PermissionKey };
  });
}

const ADMIN_APPROVE_MANAGE = [
  "role:site-administrator:approve",
  "role:pm-super-administrator:approve",
  "role:site-administrator:manage",
  "role:pm-super-administrator:manage",
];

const DEFAULT_DOMAIN_MATRIX: Record<string, string[]> = {
  "general-documents": [
    "role:member:view",
    "role:member:upload",
    "role:secretary:approve",
    "role:worshipful-master:approve",
    "role:past-master:approve",
    ...ADMIN_APPROVE_MANAGE,
  ],
  "meeting-minutes": [
    "role:member:view",
    "role:secretary:upload",
    "role:worshipful-master:upload",
    "role:past-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:secretary:approve",
    "role:worshipful-master:approve",
    "role:past-master:approve",
    ...ADMIN_APPROVE_MANAGE,
  ],
  "secretary-documents": [
    "role:secretary:view",
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:secretary:upload",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:secretary:approve",
    "role:worshipful-master:approve",
    "role:site-administrator:approve",
    "role:pm-super-administrator:approve",
    "role:site-administrator:manage",
    "role:pm-super-administrator:manage",
  ],
  "treasury-documents": [
    "role:treasurer:view",
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:treasurer:upload",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:treasurer:approve",
    "role:worshipful-master:approve",
    "role:site-administrator:approve",
    "role:pm-super-administrator:approve",
    "role:site-administrator:manage",
    "role:pm-super-administrator:manage",
  ],
  "wm-documents": [
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:worshipful-master:approve",
    "role:site-administrator:approve",
    "role:pm-super-administrator:approve",
    "role:site-administrator:manage",
    "role:pm-super-administrator:manage",
  ],
  "ea-ritual": [
    "degree:1:view",
    "role:past-master:view",
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:past-master:upload",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:past-master:approve",
    "role:worshipful-master:approve",
    ...ADMIN_APPROVE_MANAGE,
  ],
  "fc-ritual": [
    "degree:2:view",
    "role:past-master:view",
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:past-master:upload",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:past-master:approve",
    "role:worshipful-master:approve",
    ...ADMIN_APPROVE_MANAGE,
  ],
  "mm-ritual": [
    "degree:3:view",
    "role:past-master:view",
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:past-master:upload",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:past-master:approve",
    "role:worshipful-master:approve",
    ...ADMIN_APPROVE_MANAGE,
  ],
  "pm-ritual": [
    "role:past-master:view",
    "role:worshipful-master:view",
    "role:site-administrator:view",
    "role:pm-super-administrator:view",
    "role:past-master:upload",
    "role:worshipful-master:upload",
    "role:site-administrator:upload",
    "role:pm-super-administrator:upload",
    "role:past-master:approve",
    "role:worshipful-master:approve",
    "role:site-administrator:approve",
    "role:pm-super-administrator:approve",
    "role:site-administrator:manage",
    "role:pm-super-administrator:manage",
  ],
};

function MatrixRow({
  label,
  subjectType,
  subjectKey,
  localSet,
  onToggle,
  isHeader,
}: {
  label: string;
  subjectType: "role" | "degree";
  subjectKey: string;
  localSet: Set<string>;
  onToggle: (key: string) => void;
  isHeader?: boolean;
}) {
  return (
    <tr className={cn("border-b border-border last:border-0", isHeader && "bg-muted/20")}>
      <td className={cn("py-2.5 pl-4 pr-3 text-sm font-medium text-foreground whitespace-nowrap", isHeader && "font-semibold text-xs uppercase tracking-wide text-muted-foreground")}>
        {label}
      </td>
      {PERMISSIONS.map((perm) => {
        const entryKey = `${subjectType}:${subjectKey}:${perm.key}`;
        const checked = localSet.has(entryKey);
        return (
          <td key={perm.key} className="py-2.5 px-3 text-center">
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggle(entryKey)}
              className="mx-auto"
            />
          </td>
        );
      })}
    </tr>
  );
}

export default function DomainAccessPage({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: domainsData } = useListDocumentDomains();
  const domain = domainsData?.domains.find((d) => d.id === id) ?? null;

  const {
    data: matrixData,
    isLoading,
    isError,
  } = useGetDocumentDomainAccessMatrix(id);

  const updateMatrix = useUpdateDocumentDomainAccessMatrix();

  const [localSet, setLocalSet] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    if (matrixData && !initialized) {
      setLocalSet(matrixToSet(matrixData.matrix));
      setInitialized(true);
    }
  }, [matrixData, initialized]);

  const serverSet = useMemo(
    () => (matrixData ? matrixToSet(matrixData.matrix) : new Set<string>()),
    [matrixData],
  );

  const isDirty = useMemo(() => {
    if (!matrixData) return false;
    if (localSet.size !== serverSet.size) return true;
    for (const key of localSet) {
      if (!serverSet.has(key)) return true;
    }
    return false;
  }, [localSet, serverSet, matrixData]);

  function handleToggle(key: string) {
    setLocalSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCancel() {
    if (matrixData) {
      setLocalSet(matrixToSet(matrixData.matrix));
    }
  }

  function handleSave() {
    updateMatrix.mutate(
      { id, data: { matrix: setToMatrixInput(localSet) } },
      {
        onSuccess: (data) => {
          toast({ title: "Access matrix saved", description: "Changes are now in effect." });
          setLocalSet(matrixToSet(data.matrix));
          setInitialized(true);
          queryClient.invalidateQueries({ queryKey: getGetDocumentDomainAccessMatrixQueryKey(id) });
        },
        onError: (e: any) => {
          toast({
            title: "Failed to save access matrix",
            description: e?.data?.error ?? "An unexpected error occurred.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleResetToDefaults() {
    const slug = domain?.slug;
    if (!slug || !DEFAULT_DOMAIN_MATRIX[slug]) {
      toast({
        title: "No defaults available",
        description: "This domain does not have a predefined default matrix.",
        variant: "destructive",
      });
      setShowResetConfirm(false);
      return;
    }
    const defaultSet = new Set(DEFAULT_DOMAIN_MATRIX[slug]);

    updateMatrix.mutate(
      { id, data: { matrix: setToMatrixInput(defaultSet) } },
      {
        onSuccess: (data) => {
          toast({ title: "Reset to defaults", description: "Access matrix restored to default settings." });
          setLocalSet(matrixToSet(data.matrix));
          setInitialized(true);
          queryClient.invalidateQueries({ queryKey: getGetDocumentDomainAccessMatrixQueryKey(id) });
          setShowResetConfirm(false);
        },
        onError: (e: any) => {
          toast({
            title: "Failed to reset access matrix",
            description: e?.data?.error ?? "An unexpected error occurred.",
            variant: "destructive",
          });
          setShowResetConfirm(false);
        },
      },
    );
  }

  const domainName = domain?.name ?? "Domain";
  const hasDefaults = domain?.slug ? !!DEFAULT_DOMAIN_MATRIX[domain.slug] : false;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5 flex-wrap">
          <button
            className="hover:text-foreground transition-colors"
            onClick={() => setLocation("/admin/domains")}
          >
            Domains &amp; Access Control
          </button>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground font-medium">{domainName}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground">Access Matrix</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2.5 shrink-0 mt-0.5">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{domainName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Permission matrix — who can do what in this domain.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasDefaults && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                disabled={updateMatrix.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset to defaults
              </Button>
            )}
            {isDirty && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={updateMatrix.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMatrix.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {updateMatrix.isPending ? "Saving…" : "Save changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-2.5 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 mb-6">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Changes to this access matrix immediately affect all users with the selected roles or degrees.</strong>
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Failed to load the access matrix. This domain may not have a linked system folder.</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Role Permissions */}
            <div className="rounded-lg border border-card-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-amber-500/5 border-t-2 border-t-amber-500/40">
                <h2 className="text-sm font-semibold text-foreground">Role Permissions</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Permissions granted to users by their assigned role.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 pl-4 pr-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-48">
                        Role
                      </th>
                      {PERMISSIONS.map((p) => (
                        <th key={p.key} className="py-2 px-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_ROWS.map((row) => (
                      <MatrixRow
                        key={row.subjectKey}
                        label={row.label}
                        subjectType={row.subjectType}
                        subjectKey={row.subjectKey}
                        localSet={localSet}
                        onToggle={handleToggle}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Degree Permissions */}
            <div className="rounded-lg border border-card-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-amber-500/5 border-t-2 border-t-amber-500/40">
                <h2 className="text-sm font-semibold text-foreground">Degree Permissions</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Permissions granted to users by their Masonic degree.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="py-2 pl-4 pr-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-48">
                        Degree
                      </th>
                      {PERMISSIONS.map((p) => (
                        <th key={p.key} className="py-2 px-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEGREE_ROWS.map((row) => (
                      <MatrixRow
                        key={row.subjectKey}
                        label={row.label}
                        subjectType={row.subjectType}
                        subjectKey={row.subjectKey}
                        localSet={localSet}
                        onToggle={handleToggle}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer action bar (visible when dirty) */}
            {isDirty && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/40 border border-border">
                <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} disabled={updateMatrix.isPending}>
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateMatrix.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMatrix.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reset to defaults confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to default permissions?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current access matrix for <strong>{domainName}</strong> with the system defaults.
              All custom permission changes will be lost and users' access will change immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMatrix.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetToDefaults}
              disabled={updateMatrix.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updateMatrix.isPending ? "Resetting…" : "Reset to defaults"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
