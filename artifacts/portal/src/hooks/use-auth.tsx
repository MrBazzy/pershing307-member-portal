import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, getGetCurrentUserQueryKey, AuthUser } from "@workspace/api-client-react";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  refetch: () => void;
  isAuthenticated: boolean;
  pendingTwoFactor: boolean;
  pendingTwoFactorExpired: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: currentUserData, isLoading, refetch } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
      refetchInterval: (query) => query.state.data?.user ? 30_000 : false,
    }
  });

  const user = currentUserData?.user ?? null;
  const isAuthenticated = !!user;
  const pendingTwoFactor = currentUserData?.pendingTwoFactor ?? false;
  const pendingTwoFactorExpired = currentUserData?.pendingTwoFactorExpired ?? false;

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        queryClient.resetQueries({ queryKey: getGetCurrentUserQueryKey() });
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, isLoading, refetch, isAuthenticated, pendingTwoFactor, pendingTwoFactorExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
