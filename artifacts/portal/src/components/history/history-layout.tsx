import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { cn } from "@/lib/utils";
import { Landmark } from "lucide-react";

const TABS = [
  { href: "/history", label: "Our History" },
  { href: "/history/timeline", label: "Historical Timeline" },
  { href: "/history/documents", label: "Historical Documents" },
  { href: "/history/pershing", label: "General John J. Pershing" },
];

interface HistoryLayoutProps {
  children: ReactNode;
}

export function HistoryLayout({ children }: HistoryLayoutProps) {
  const [location] = useLocation();

  function isActive(tab: { href: string }) {
    return tab.href === "/history"
      ? location === "/history"
      : location.startsWith(tab.href);
  }

  const activeTab = TABS.find(isActive) ?? TABS[0];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary/10 shrink-0">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-primary">History</h1>
            <p className="text-xs text-muted-foreground">Tracing our journey from Fontainebleau to Maastricht since 1959</p>
          </div>
        </div>
        <div className="h-px bg-sidebar-active/40" />

        {/* Mobile: dropdown select */}
        <div className="sm:hidden">
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={activeTab.href}
            onChange={(e) => {
              const tab = TABS.find((t) => t.href === e.target.value);
              if (tab) window.location.href = tab.href;
            }}
            aria-label="History section"
          >
            {TABS.map((tab) => (
              <option key={tab.href} value={tab.href}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop: horizontal tab bar */}
        <div className="hidden sm:block border-b border-border">
          <nav className="flex gap-0 -mb-px" aria-label="History sections">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive(tab)
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>

        {children}
      </div>
    </AppLayout>
  );
}
