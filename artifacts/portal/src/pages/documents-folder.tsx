import { Link } from "wouter";
import { useGetDocumentFolder } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen, ChevronRight, Folder, AlertCircle } from "lucide-react";

interface Props {
  id: string;
}

export default function DocumentsFolderPage({ id }: Props) {
  const { data: folder, isLoading, isError, error } = useGetDocumentFolder(id);

  const isAccessDenied = (error as any)?.status === 403;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
          <Link href="/documents" className="hover:text-foreground transition-colors">
            Documents
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          {isLoading ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="text-foreground font-medium">{folder?.title ?? "Folder"}</span>
          )}
        </nav>

        {isError && isAccessDenied && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Access Denied</p>
              <p className="text-xs text-muted-foreground mt-1">
                You do not have permission to view this folder.
              </p>
              <Link href="/documents">
                <Button variant="outline" size="sm" className="mt-4">
                  Back to Documents
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {isError && !isAccessDenied && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Failed to load folder. Please try again.
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && !isError && folder && (
          <>
            {/* Folder header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="rounded-md bg-primary/10 p-2.5">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground leading-tight">
                  {folder.title}
                </h1>
                {folder.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{folder.description}</p>
                )}
              </div>
            </div>

            {/* Subfolders section */}
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
              Subfolders
            </h2>

            {folder.subfolders.length === 0 ? (
              <Card className="border-card-border border-dashed">
                <CardContent className="py-10 text-center">
                  <Folder className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2.5" />
                  <p className="text-sm text-muted-foreground">No subfolders yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {folder.subfolders.map((sub) => (
                  <Card key={sub.id} className="border-card-border">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="rounded-md bg-muted p-2 shrink-0">
                        <Folder className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{sub.title}</p>
                        {sub.description && (
                          <p className="text-xs text-muted-foreground truncate">{sub.description}</p>
                        )}
                        {sub.subfolderCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {sub.subfolderCount} subfolder{sub.subfolderCount !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
