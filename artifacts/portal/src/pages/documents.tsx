import { AppLayout } from "@/components/layout/app-layout";
import { useListDocumentFolders, type DocumentFolderItem } from "@workspace/api-client-react";
import { Link } from "wouter";
import { FolderOpen, ChevronRight, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const RITUAL_BG = "bg-amber-500/10";
const RITUAL_ICON = "text-amber-600 dark:text-amber-500";
const GENERAL_BG = "bg-primary/10";
const GENERAL_ICON = "text-primary";

function FolderCard({
  folder,
}: {
  folder: {
    id: string;
    title: string;
    description?: string | null;
    frame: string;
    subfolderCount: number;
  };
}) {
  const isRitual = folder.frame === "ritual";
  return (
    <Link href={`/documents/${folder.id}`}>
      <Card className="border-card-border cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group h-full">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <div className={cn("rounded-md p-2.5", isRitual ? RITUAL_BG : GENERAL_BG)}>
              {isRitual
                ? <BookOpen className={cn("h-5 w-5", RITUAL_ICON)} />
                : <FolderOpen className={cn("h-5 w-5", GENERAL_ICON)} />}
            </div>
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
  );
}

function FrameSection({
  title,
  description,
  folders,
  isLoading,
}: {
  title: string;
  description: string;
  folders: DocumentFolderItem[];
  isLoading: boolean;
}) {
  if (!isLoading && folders.length === 0) return null;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  const { data, isLoading, isError } = useListDocumentFolders();

  const allFolders = data?.folders ?? [];
  const generalFolders = allFolders.filter((f) => f.frame !== "ritual");
  const ritualFolders = allFolders.filter((f) => f.frame === "ritual");

  const hasGeneral = isLoading || generalFolders.length > 0;
  const hasRitual = isLoading || ritualFolders.length > 0;
  const showBothFrames = hasGeneral && hasRitual;

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse lodge documents and records.
          </p>
        </div>

        {isError && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Failed to load document folders. Please try again.
            </CardContent>
          </Card>
        )}

        {!isError && !isLoading && allFolders.length === 0 && (
          <Card className="border-card-border">
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No document folders are available for your account.
              </p>
            </CardContent>
          </Card>
        )}

        {!isError && (hasGeneral || hasRitual) && (
          <div className="space-y-8">
            <FrameSection
              title="General Documents"
              description="Administrative records and member resources."
              folders={generalFolders}
              isLoading={isLoading}
            />

            {showBothFrames && !isLoading && (
              <Separator />
            )}

            <FrameSection
              title="Ritual Documents"
              description="Degree ritual materials and ceremonial resources."
              folders={ritualFolders}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
