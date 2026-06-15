import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EnvBannerAuth } from "@/components/ui/env-banner";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-primary mb-4">
            <span className="text-primary-foreground font-serif font-bold text-lg">G</span>
          </div>
          <h1 className="text-2xl font-serif font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={cn(
          "bg-card border border-card-border rounded-sm shadow-sm p-8"
        )}>
          {children}
        </div>
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            General John J. Pershing Lodge No. 307
          </p>
          <EnvBannerAuth />
        </div>
      </div>
    </div>
  );
}
