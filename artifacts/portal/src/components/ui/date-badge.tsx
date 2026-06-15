import { format, parseISO } from "date-fns";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DateBadgeProps {
  date?: string;
  month?: number;
  day?: number;
  year?: number;
  variant?: "default" | "amber";
  size?: "sm" | "md";
}

export function DateBadge({
  date,
  month,
  day,
  year,
  variant = "default",
  size = "sm",
}: DateBadgeProps) {
  let m: string, d: string, y: string | undefined;

  if (date) {
    const parsed = parseISO(date);
    m = format(parsed, "MMM");
    d = format(parsed, "d");
    y = format(parsed, "yyyy");
  } else {
    m = month !== undefined ? MONTH_ABBR[month - 1] : "";
    d = day !== undefined ? String(day) : "";
    y = year !== undefined ? String(year) : undefined;
  }

  const isAmber = variant === "amber";
  const isSm = size === "sm";

  return (
    <div
      className={[
        "flex flex-col items-center justify-center shrink-0 rounded-sm",
        isSm ? "w-9 py-1" : "w-12 py-1.5",
        isAmber ? "bg-amber-50 border border-amber-200" : "bg-muted",
      ].join(" ")}
    >
      <span
        className={[
          "font-semibold uppercase leading-none",
          isSm ? "text-[9px]" : "text-[10px]",
          isAmber ? "text-amber-700" : "text-muted-foreground",
        ].join(" ")}
      >
        {m}
      </span>
      <span
        className={[
          "font-bold leading-tight tabular-nums",
          isSm ? "text-sm" : "text-lg",
          isAmber ? "text-amber-700" : "text-foreground",
        ].join(" ")}
      >
        {d}
      </span>
      {y !== undefined && (
        <span
          className={[
            "font-semibold leading-none tabular-nums",
            isSm ? "text-[9px]" : "text-[10px]",
            isAmber ? "text-amber-600" : "text-muted-foreground",
          ].join(" ")}
        >
          {y}
        </span>
      )}
    </div>
  );
}
