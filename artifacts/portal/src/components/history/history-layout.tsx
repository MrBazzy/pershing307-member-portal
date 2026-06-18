import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { cn } from "@/lib/utils";
import { Landmark } from "lucide-react";

const TABS = [
  { href: "/history", label: "Our History" },
  { href: "/history/timeline", label: "Historical Timeline" },
  { href: "/history/documents", label: "Historical Documents" },
];

interface HistoryLayoutProps {
  children: ReactNode;
}

export function HistoryLayout({ children }: HistoryLayoutProps) {
  const [location] = useLocation();

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary/10 shrink-0">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-primary">History</h1>
            <p className="text-xs text-muted-foreground">Heritage of General John J. Pershing Lodge No. 307</p>
          </div>
        </div>
        <div className="h-px bg-sidebar-active/40" />

        <div className="border-b border-border">
          <nav className="flex gap-0 -mb-px" aria-label="History sections">
            {TABS.map((tab) => {
              const active =
                tab.href === "/history"
                  ? location === "/history"
                  : location.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {children}
      </div>
    </AppLayout>
  );
}
