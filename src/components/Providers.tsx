"use client";

import { useEffect } from "react";
import { SessionProvider } from "@/lib/auth/react-session";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { RealtimeDataSyncProvider } from "@/components/realtime/RealtimeDataSyncProvider";
import { initializeFirebaseAppCheck } from "@/lib/firebase-app-check";
import {
  initializeFirebasePerformance,
  instrumentClientFetchWithPerformance,
  startAppStartupPerformanceTrace,
} from "@/lib/firebase-performance";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void initializeFirebaseAppCheck();
    void initializeFirebasePerformance();
    void startAppStartupPerformanceTrace();
    instrumentClientFetchWithPerformance();
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider>
        <PWAProvider>
          <RealtimeDataSyncProvider>
            <AnalyticsProvider>
              {children}
            </AnalyticsProvider>
          </RealtimeDataSyncProvider>
        </PWAProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

