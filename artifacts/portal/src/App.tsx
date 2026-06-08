import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useGetBootstrapStatus } from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AcceptInvitationPage from "@/pages/accept-invitation";
import BootstrapPage from "@/pages/bootstrap";
import DashboardPage from "@/pages/dashboard";
import AdminUsersPage from "@/pages/admin/users";
import AdminInvitationsPage from "@/pages/admin/invitations";
import AdminAuditLogPage from "@/pages/admin/audit-log";
import { useEffect } from "react";

const queryClient = new QueryClient({
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
        <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
        <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsersPage} />} />
        <Route path="/admin/invitations" component={() => <ProtectedRoute component={AdminInvitationsPage} />} />
        <Route path="/admin/audit-log" component={() => <ProtectedRoute component={AdminAuditLogPage} />} />
        <Route component={NotFound} />
      </Switch>
    </BootstrapCheck>
  );
}

function App() {
  return (
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
  );
}

export default App;
