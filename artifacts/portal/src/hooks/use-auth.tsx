import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetCurrentUser, getGetCurrentUserQueryKey, AuthUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  refetch: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: currentUserData, isLoading, refetch } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
    }
  });

  const user = currentUserData?.user ?? null;
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isLoading, refetch, isAuthenticated }}>
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
