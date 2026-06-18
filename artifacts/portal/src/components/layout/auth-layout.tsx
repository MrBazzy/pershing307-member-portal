import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EnvBannerAuth } from "@/components/ui/env-banner";
import pershingPortrait from "@assets/JohnJPershing_1781792629576.jpg";

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
          <img
            src={pershingPortrait}
            alt="General John J. Pershing"
            className="w-16 h-16 rounded-full object-cover mx-auto mb-4"
            style={{
              objectPosition: "center 12%",
              border: "2px solid hsl(var(--sidebar-active))",
              filter: "grayscale(100%) contrast(1.2) brightness(1.05)",
            }}
          />
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
