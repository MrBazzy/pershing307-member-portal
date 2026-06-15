import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { cn } from "@/lib/utils";
import { Landmark, Settings } from "lucide-react";

const ADMIN_TABS = [
  { href: "/admin/history", label: "Our History" },
  { href: "/admin/history/timeline", label: "Historical Timeline" },
  { href: "/admin/history/documents", label: "Historical Documents" },
];

interface AdminHistoryLayoutProps {
  children: ReactNode;
}

export function AdminHistoryLayout({ children }: AdminHistoryLayoutProps) {
  const [location] = useLocation();

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary/10 shrink-0">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">History Management</h1>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                <Settings className="h-2.5 w-2.5 mr-1" />
                Admin
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Edit and manage Heritage content for Pershing Lodge No. 307
            </p>
          </div>
        </div>

        <div className="border-b border-border">
          <nav className="flex gap-0 -mb-px" aria-label="History management sections">
            {ADMIN_TABS.map((tab) => {
              const active =
                tab.href === "/admin/history"
                  ? location === "/admin/history"
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
