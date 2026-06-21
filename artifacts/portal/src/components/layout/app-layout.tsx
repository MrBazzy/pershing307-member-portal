import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import pershingPortrait from "@assets/JohnJPershing_1781792629576.jpg";
import { useLogout, useGetDocumentReviewCount, getGetDocumentReviewCountQueryKey, useGetBootstrapStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, FileText, LogOut, ChevronRight,
  Shield, Globe, Settings, Menu, X, Cake, Map, UserCircle,
  BookOpen, CalendarDays, Landmark, Fingerprint, FolderOpen, BarChart3,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EnvBannerSidebar, EnvBannerMobilePill } from "@/components/ui/env-banner";
import { VISITOR_LEVEL, MEMBER_LEVEL, ADMIN_LEVEL } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MEMBER_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tracing-board", label: "Tracing Board", icon: BookOpen },
  { href: "/history", label: "History", icon: Landmark },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/birthdays", label: "Birthdays", icon: Cake },
  { href: "/documents", label: "Documents", icon: FolderOpen },
];

const MANAGEMENT_ITEMS: NavItem[] = [
  { href: "/admin/users", label: "Members", icon: Users },
  { href: "/admin/roles-degrees", label: "Roles & Degrees", icon: Shield },
  { href: "/admin/domains", label: "Domains & Access Control", icon: Globe },
  { href: "/admin/document-management", label: "Document Management", icon: FolderOpen },
  { href: "/admin/document-review", label: "Document Review", icon: ClipboardCheck },
  { href: "/admin/tracing-board", label: "Tracing Board", icon: BookOpen },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/history", label: "History", icon: Landmark },
  { href: "/admin/roadmap", label: "Roadmap", icon: Map },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/config", label: "Configuration", icon: Settings },
  { href: "/admin/audit-log", label: "Audit Log", icon: FileText },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const level = user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
  const isVisitorOrAbove = level >= VISITOR_LEVEL;
  const isMemberOrAbove = level >= MEMBER_LEVEL;
  const isAdmin = level >= ADMIN_LEVEL;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/login";
      },
      onError: () => { toast({ title: "Logout failed", variant: "destructive" }); },
    });
  };

  const NavLink = ({ item, onNav, badge }: { item: NavItem; onNav?: () => void; badge?: number }) => {
    const active = location === item.href || location.startsWith(item.href + "/");
    return (
      <Link
        href={item.href}
        onClick={onNav}
        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-colors",
          active
            ? "bg-sidebar-active text-sidebar-active-foreground font-medium"
            : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span>{item.label}</span>
        <span className="ml-auto flex items-center gap-1">
          {badge !== undefined && badge > 0 && (
            <span className="rounded-full bg-amber-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {active && <ChevronRight className="h-3 w-3" />}
        </span>
      </Link>
    );
  };

  const { data: reviewCountData } = useGetDocumentReviewCount({
    query: { enabled: isAdmin, queryKey: getGetDocumentReviewCountQueryKey() },
  });
  const reviewPendingCount = reviewCountData?.pendingCount ?? 0;

  const { data: bootstrapStatus } = useGetBootstrapStatus();
  const lodgeName = bootstrapStatus?.lodgeName ?? "Member Portal";
  const lodgeNumber = bootstrapStatus?.lodgeNumber;

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="px-5 pt-5 pb-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <img
            src={pershingPortrait}
            alt="General John J. Pershing"
            className="w-9 h-9 rounded-full object-cover shrink-0"
            style={{
              objectPosition: "center 12%",
              border: "1.5px solid hsl(var(--sidebar-active))",
              filter: "grayscale(100%) contrast(1.2) brightness(1.05)",
            }}
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">{lodgeName}</p>
            <p className="text-[10px] text-sidebar-muted truncate leading-tight">{lodgeNumber ? `No. ${lodgeNumber}` : "Member Portal"}</p>
          </div>
        </div>
        <EnvBannerSidebar />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Dashboard — always shown to any authenticated user */}
        <NavLink item={MEMBER_NAV_ITEMS[0]} onNav={onNav} />

        {/* Tracing Board and History — visible to Visitors and above */}
        {isVisitorOrAbove && (
          <>
            <NavLink item={MEMBER_NAV_ITEMS[1]} onNav={onNav} />
            <NavLink item={MEMBER_NAV_ITEMS[2]} onNav={onNav} />
          </>
        )}

        {/* Events and Birthdays — Member+ only */}
        {isMemberOrAbove && MEMBER_NAV_ITEMS.slice(3).map((item) => (
          <NavLink key={item.href} item={item} onNav={onNav} />
        ))}

        {/* Management block — admins only */}
        {isAdmin && (
          <div className="pt-3">
            <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-1.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-widest px-2 pb-0.5 pt-0.5">
                Management
              </p>
              {MANAGEMENT_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  onNav={onNav}
                  badge={item.href === "/admin/document-review" ? reviewPendingCount : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Settings — Visitor+ sees 2FA; Member+ also sees Profile */}
        {isVisitorOrAbove && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-widest">Settings</p>
            </div>
            {isMemberOrAbove && (
              <NavLink item={{ href: "/settings/profile", label: "Profile", icon: UserCircle }} onNav={onNav} />
            )}
            <NavLink item={{ href: "/settings/2fa", label: "Two-Factor Auth", icon: Shield }} onNav={onNav} />
            <NavLink item={{ href: "/settings/passkeys", label: "Passkeys", icon: Fingerprint }} onNav={onNav} />
          </>
        )}

        {/* Sign Out — always just below Settings */}
        <div className="pt-2">
          <Separator className="bg-sidebar-border mb-2" />
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[11px] text-sidebar-muted truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost" size="sm"
            className="w-full justify-start text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs"
            onClick={handleLogout}
            disabled={logout.isPending}
            data-testid="button-logout"
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign Out
          </Button>
        </div>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex-col sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar border-r border-sidebar-border flex flex-col z-50 shadow-xl">
            <div className="absolute top-3 right-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent onNav={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-auto">
        <header className="md:hidden sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <img
              src={pershingPortrait}
              alt="General John J. Pershing"
              className="w-7 h-7 rounded-full object-cover shrink-0"
              style={{
                objectPosition: "center 12%",
                border: "1.5px solid hsl(var(--sidebar-active))",
                filter: "grayscale(100%) contrast(1.2) brightness(1.05)",
              }}
            />
            <span className="text-sm font-semibold text-foreground">{lodgeName}{lodgeNumber ? ` No. ${lodgeNumber}` : ""}</span>
          </div>
          <EnvBannerMobilePill />
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
