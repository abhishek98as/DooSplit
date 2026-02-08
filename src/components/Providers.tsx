"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <PWAProvider>
          <AnalyticsProvider>
            {children}
          </AnalyticsProvider>
        </PWAProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
