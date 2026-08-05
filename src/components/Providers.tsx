"use client";

import { useEffect } from "react";
import { SessionProvider } from "@/lib/auth/react-session";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { HapticFeedbackProvider } from "@/contexts/HapticFeedbackContext";
import { ProAccessProvider } from "@/contexts/ProAccessContext";
import { ProUpgradeModal } from "@/components/ProGate";
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
        <HapticFeedbackProvider>
          <ProAccessProvider>
            <PWAProvider>
              <RealtimeDataSyncProvider>
                <AnalyticsProvider>
                  {children}
                  <ProUpgradeModal />
                </AnalyticsProvider>
              </RealtimeDataSyncProvider>
            </PWAProvider>
          </ProAccessProvider>
        </HapticFeedbackProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

