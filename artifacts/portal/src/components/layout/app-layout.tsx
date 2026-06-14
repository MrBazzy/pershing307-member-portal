import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Mail, FileText, LogOut, ChevronRight,
  Shield, Globe, GraduationCap, Settings, Menu, X, Cake, Map, UserCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  pmSuperAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/birthdays", label: "Birthdays", icon: Cake },
  { href: "/admin/users", label: "Members", icon: Users, adminOnly: true },
  { href: "/admin/invitations", label: "Invitations", icon: Mail, adminOnly: true },
  { href: "/admin/domains", label: "Domains", icon: Globe, adminOnly: true },
  { href: "/admin/degrees", label: "Degrees", icon: GraduationCap, adminOnly: true },
  { href: "/admin/roadmap", label: "Roadmap", icon: Map, adminOnly: true },
  { href: "/admin/config", label: "Configuration", icon: Settings, adminOnly: true },
  { href: "/admin/audit-log", label: "Audit Log", icon: FileText, adminOnly: true },
];

const SETTINGS_ITEMS: NavItem[] = [
  { href: "/settings/profile", label: "Profile", icon: UserCircle },
  { href: "/settings/2fa", label: "Two-Factor Auth", icon: Shield },
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

  const isAdmin = user?.roles?.some((r) => r.permissionLevel >= 80) ?? false;
  const isPmSuperAdmin = user?.roles?.some((r) => r.permissionLevel >= 90) ?? false;

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/login";
      },
      onError: () => { toast({ title: "Logout failed", variant: "destructive" }); },
    });
  };

  const visibleNav = NAV_ITEMS.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.pmSuperAdminOnly || isPmSuperAdmin)
  );

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-primary shrink-0">
            <span className="text-primary-foreground font-serif font-bold text-sm">G</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate leading-tight">Pershing No. 307</p>
            <p className="text-[10px] text-muted-foreground truncate leading-tight">Member Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => {
          const active = location === item.href || location.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {active && <ChevronRight className="h-3 w-3 ml-auto" />}
            </Link>
          );
        })}

        {SETTINGS_ITEMS.length > 0 && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Settings</p>
            </div>
            {SETTINGS_ITEMS.map((item) => {
              const active = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNav}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-sm text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  {active && <ChevronRight className="h-3 w-3 ml-auto" />}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <Separator />
      <div className="p-3">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-medium text-foreground truncate">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost" size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground text-xs"
          onClick={handleLogout}
          disabled={logout.isPending}
          data-testid="button-logout"
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-card flex-col">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border flex flex-col z-50 shadow-xl">
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
            <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-primary">
              <span className="text-primary-foreground font-serif font-bold text-xs">G</span>
            </div>
            <span className="text-sm font-semibold text-foreground">Pershing No. 307</span>
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
