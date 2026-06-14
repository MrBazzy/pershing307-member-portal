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
import TwoFactorPage from "@/pages/settings/two-factor";
import { useEffect } from "react";

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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    if ((user?.mustChangePassword || user?.profileSetupRequired) && location !== "/setup") {
      setLocation("/setup");
    }
  }, [isLoading, isAuthenticated, user, setLocation, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if ((user?.mustChangePassword || user?.profileSetupRequired) && location !== "/setup") return null;
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
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
        <Route path="/settings/2fa" component={() => <ProtectedRoute component={TwoFactorPage} />} />
        <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsersPage} />} />
        <Route path="/admin/invitations" component={() => <ProtectedRoute component={AdminInvitationsPage} />} />
        <Route path="/admin/domains" component={() => <ProtectedRoute component={AdminDomainsPage} />} />
        <Route path="/admin/degrees" component={() => <ProtectedRoute component={AdminDegreesPage} />} />
        <Route path="/admin/config" component={() => <ProtectedRoute component={AdminConfigPage} />} />
        <Route path="/admin/audit-log" component={() => <ProtectedRoute component={AdminAuditLogPage} />} />
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
