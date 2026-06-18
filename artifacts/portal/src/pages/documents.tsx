import { AppLayout } from "@/components/layout/app-layout";
import { useListDocumentFolders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { FolderOpen, ChevronRight, BookOpen, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RITUAL_KEYWORDS = ["ritual", "apprentice", "fellowcraft", "master mason", "past master"];
const RITUAL_FOLDER_COLOR = "bg-amber-500/10 text-amber-600 dark:text-amber-500";
const STANDARD_FOLDER_COLOR = "bg-primary/10 text-primary";

function FolderIcon({ title, className }: { title: string; className?: string }) {
  const isRitual = RITUAL_KEYWORDS.some((k) => title.toLowerCase().includes(k));
  const Icon = isRitual ? BookOpen : isRitual ? FolderOpen : FileText;
  const colorClass = isRitual ? RITUAL_FOLDER_COLOR : STANDARD_FOLDER_COLOR;
  return (
    <div className={cn("rounded-md p-2.5", colorClass.split(" ").filter((c) => c.startsWith("bg")).join(" "))}>
      {isRitual
        ? <BookOpen className={cn("h-5 w-5", colorClass.split(" ").filter((c) => !c.startsWith("bg")).join(" "))} />
        : <FolderOpen className={cn("h-5 w-5", colorClass.split(" ").filter((c) => !c.startsWith("bg")).join(" "))} />}
    </div>
  );
}

export default function DocumentsPage() {
  const { data, isLoading, isError } = useListDocumentFolders();

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse lodge documents and records.
          </p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Failed to load document folders. Please try again.
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (data?.folders ?? []).length === 0 && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No document folders are available for your account.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (data?.folders ?? []).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data!.folders.map((folder) => (
              <Link key={folder.id} href={`/documents/${folder.id}`}>
                <Card className="border-card-border cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group h-full">
                  <CardContent className="p-5 flex flex-col gap-3 h-full">
                    <div className="flex items-start justify-between gap-2">
                      <FolderIcon title={folder.title} />
                      {folder.subfolderCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                          {folder.subfolderCount}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 min-h-0">
                      <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors leading-snug">
                        {folder.title}
                      </h3>
                      {folder.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {folder.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground group-hover:text-primary/80 transition-colors mt-auto">
                      <span>Open folder</span>
                      <ChevronRight className="h-3 w-3 ml-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
