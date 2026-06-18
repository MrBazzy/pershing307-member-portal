import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useGetBootstrapStatus } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AcceptInvitationPage from "@/pages/accept-invitation";
import BootstrapPage from "@/pages/bootstrap";
import DashboardPage from "@/pages/dashboard";
import SetupPage from "@/pages/setup";
import AdminUsersPage from "@/pages/admin/users";
import AdminInvitationsPage from "@/pages/admin/invitations";
import AdminAuditLogPage from "@/pages/admin/audit-log";
import AdminDomainsPage from "@/pages/admin/domains";
import AdminDegreesPage from "@/pages/admin/degrees";
import AdminConfigPage from "@/pages/admin/config";
import AdminRoadmapPage from "@/pages/admin/roadmap";
import AdminTracingBoardPage from "@/pages/admin/tracing-board";
import AdminEventsPage from "@/pages/admin/events";
import AdminHistorySectionsPage from "@/pages/admin/history-sections";
import AdminHistoryTimelinePage from "@/pages/admin/history-timeline";
import AdminHistoryDocumentsPage from "@/pages/admin/history-documents";
import AdminHistoryPershingPage from "@/pages/admin/history-pershing";
import TracingBoardPage from "@/pages/tracing-board";
import EventsPage from "@/pages/events";
import OurHistoryPage from "@/pages/history/our-history";
import HistoricalTimelinePage from "@/pages/history/timeline";
import HistoricalDocumentsPage from "@/pages/history/documents";
import PershingBiographyPage from "@/pages/history/pershing";
import TwoFactorPage from "@/pages/settings/two-factor";
import ProfileSettingsPage from "@/pages/settings/profile";
import BirthdaysPage from "@/pages/birthdays";
import { useEffect } from "react";
import { VISITOR_LEVEL, MEMBER_LEVEL, ADMIN_LEVEL } from "@/lib/roles";

export { VISITOR_LEVEL, MEMBER_LEVEL, ADMIN_LEVEL };

function onGlobalApiError(error: unknown) {
  const err = error as any;
  if (err?.status === 401 && err?.data?.reason === "force_logout") {
    sessionStorage.setItem("loginNotice", "force_logout");
    queryClient.clear();
    window.location.replace("/login");
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onGlobalApiError }),
  mutationCache: new MutationCache({ onError: onGlobalApiError }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

function BootstrapCheck({ children }: { children: React.ReactNode }) {
  const { data: status, isLoading } = useGetBootstrapStatus();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && status && !status.bootstrapped && location !== "/bootstrap") {
      setLocation("/bootstrap");
    }
  }, [isLoading, status, setLocation, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-primary mb-3">
            <span className="text-primary-foreground font-serif font-bold">G</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function maxPermLevel(user: ReturnType<typeof useAuth>["user"]): number {
  return user?.roles?.reduce((max, r) => Math.max(max, r.permissionLevel), 0) ?? 0;
}

function ProtectedRoute({
  component: Component,
  minLevel = 0,
}: {
  component: React.ComponentType;
  minLevel?: number;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();

  const level = maxPermLevel(user);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { setLocation("/login"); return; }
    if ((user?.mustChangePassword || user?.profileSetupRequired) && location !== "/setup") {
      setLocation("/setup");
      return;
    }
    if (level < minLevel) { setLocation("/dashboard"); }
  }, [isLoading, isAuthenticated, user, level, minLevel, setLocation, location]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return null;
  if ((user?.mustChangePassword || user?.profileSetupRequired) && location !== "/setup") return null;
  if (level < minLevel) return null;
  return <Component />;
}

function SetupRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? <Component /> : null;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) return <LoadingScreen />;
  return !isAuthenticated ? <Component /> : null;
}

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      setLocation(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  return <LoadingScreen />;
}

function AppRoutes() {
  return (
    <BootstrapCheck>
      <Switch>
        <Route path="/" component={RootRedirect} />
        <Route path="/login" component={() => <PublicRoute component={LoginPage} />} />
        <Route path="/forgot-password" component={() => <PublicRoute component={ForgotPasswordPage} />} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/accept-invitation" component={AcceptInvitationPage} />
        <Route path="/bootstrap" component={BootstrapPage} />
        <Route path="/setup" component={() => <SetupRoute component={SetupPage} />} />

        <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />

        <Route path="/tracing-board" component={() => <ProtectedRoute component={TracingBoardPage} minLevel={VISITOR_LEVEL} />} />
        <Route path="/history" component={() => <ProtectedRoute component={OurHistoryPage} minLevel={VISITOR_LEVEL} />} />
        <Route path="/history/timeline" component={() => <ProtectedRoute component={HistoricalTimelinePage} minLevel={VISITOR_LEVEL} />} />
        <Route path="/history/documents" component={() => <ProtectedRoute component={HistoricalDocumentsPage} minLevel={VISITOR_LEVEL} />} />
        <Route path="/history/pershing" component={() => <ProtectedRoute component={PershingBiographyPage} minLevel={VISITOR_LEVEL} />} />
        <Route path="/events" component={() => <ProtectedRoute component={EventsPage} minLevel={MEMBER_LEVEL} />} />
        <Route path="/birthdays" component={() => <ProtectedRoute component={BirthdaysPage} minLevel={MEMBER_LEVEL} />} />

        <Route path="/settings/profile" component={() => <ProtectedRoute component={ProfileSettingsPage} minLevel={MEMBER_LEVEL} />} />
        <Route path="/settings/2fa" component={() => <ProtectedRoute component={TwoFactorPage} minLevel={VISITOR_LEVEL} />} />

        <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsersPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/invitations" component={() => <ProtectedRoute component={AdminInvitationsPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/domains" component={() => <ProtectedRoute component={AdminDomainsPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/degrees" component={() => <ProtectedRoute component={AdminDegreesPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/config" component={() => <ProtectedRoute component={AdminConfigPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/audit-log" component={() => <ProtectedRoute component={AdminAuditLogPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/roadmap" component={() => <ProtectedRoute component={AdminRoadmapPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/tracing-board" component={() => <ProtectedRoute component={AdminTracingBoardPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/events" component={() => <ProtectedRoute component={AdminEventsPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/history" component={() => <ProtectedRoute component={AdminHistorySectionsPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/history/timeline" component={() => <ProtectedRoute component={AdminHistoryTimelinePage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/history/documents" component={() => <ProtectedRoute component={AdminHistoryDocumentsPage} minLevel={ADMIN_LEVEL} />} />
        <Route path="/admin/history/pershing" component={() => <ProtectedRoute component={AdminHistoryPershingPage} minLevel={ADMIN_LEVEL} />} />

        <Route component={NotFound} />
      </Switch>
    </BootstrapCheck>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
