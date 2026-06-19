import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_review: {
    label: "Pending Review",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  archived: {
    label: "Archived",
    className: "bg-muted text-muted-foreground border-border",
  },
  deleted: {
    label: "Deleted",
    className: "bg-muted text-muted-foreground border-border",
  },
  withdrawn: {
    label: "Withdrawn",
    className: "bg-muted text-muted-foreground border-border",
  },
  published: {
    label: "Published",
    className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  },
};

export function DocumentStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "" };
  return (
    <Badge
      variant="outline"
      className={cn(config.className, "font-medium", className)}
    >
      {config.label}
    </Badge>
  );
}
