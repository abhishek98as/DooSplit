"use client";

import { useEffect, useContext, createContext, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { initializeAnalytics, setUserId, logEvent, AnalyticsEvents } from "@/lib/firebase-analytics";

interface AnalyticsContextType {
  trackEvent: (eventName: string, parameters?: Record<string, any>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

interface AnalyticsProviderProps {
  children: ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
    logEvent(eventName, parameters);
  };

  // Initialize analytics on mount
  useEffect(() => {
    initializeAnalytics();
  }, []);

  // Track user authentication state
  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      setUserId(session.user.id);
      logEvent(AnalyticsEvents.LOGIN, {
        method: session.user.email ? "email" : "google",
      });
    } else if (status === "unauthenticated") {
      // User logged out
      logEvent(AnalyticsEvents.LOGOUT);
    }
  }, [status, session]);

  // Track page views
  useEffect(() => {
    if (pathname) {
      logEvent(AnalyticsEvents.PAGE_VIEW, {
        page_path: pathname,
        page_title: document.title,
      });
    }
  }, [pathname]);

  // Track dashboard views specifically
  useEffect(() => {
    if (pathname === "/dashboard") {
      logEvent(AnalyticsEvents.DASHBOARD_VIEW);
    }
  }, [pathname]);

  // Track JavaScript errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      trackEvent(AnalyticsEvents.ERROR_OCCURRED, {
        error_type: 'javascript_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      trackEvent(AnalyticsEvents.ERROR_OCCURRED, {
        error_type: 'unhandled_promise_rejection',
        reason: event.reason?.toString(),
        stack: event.reason?.stack,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [trackEvent]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error("useAnalytics must be used within an AnalyticsProvider");
  }
  return context;
}