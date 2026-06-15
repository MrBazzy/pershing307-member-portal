import { useListHistoryDocuments } from "@workspace/api-client-react";
import { HistoryLayout } from "@/components/history/history-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  Charter: "bg-amber-100 text-amber-800 border-amber-200",
  Petition: "bg-blue-100 text-blue-800 border-blue-200",
  Minutes: "bg-slate-100 text-slate-700 border-slate-200",
  Correspondence: "bg-green-100 text-green-800 border-green-200",
  Photograph: "bg-purple-100 text-purple-800 border-purple-200",
  Certificate: "bg-rose-100 text-rose-800 border-rose-200",
};

interface HistoryDoc {
  id: string;
  title: string;
  description: string | null;
  documentDate: string | null;
  category: string | null;
  fileUrl: string | null;
  sortOrder: number;
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cls = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium border", cls)}>
      {category}
    </span>
  );
}

function openAttachment(fileUrl: string) {
  window.open(`/api/storage${fileUrl}`, "_blank", "noopener,noreferrer");
}

export default function HistoricalDocumentsPage() {
  const { data, isLoading } = useListHistoryDocuments();
  const documents = (data?.documents ?? []) as HistoryDoc[];

  return (
    <HistoryLayout>
      <p className="text-sm text-muted-foreground mb-2">
        A registry of significant historical documents associated with the Lodge.
      </p>

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
            <p className="text-sm text-muted-foreground">No documents recorded yet. Check back later.</p>
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
                    {doc.fileUrl && (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs gap-1.5"
                          onClick={() => openAttachment(doc.fileUrl!)}
                        >
                          <Download className="h-3 w-3" />
                          Open / Download
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </HistoryLayout>
  );
}
