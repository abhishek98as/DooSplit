"use client";

import { app } from "@/lib/firebase";
import { getFirebaseAppCheckToken } from "@/lib/firebase-app-check";

type PerfModule = typeof import("firebase/performance");

let perfModule: PerfModule | null = null;
let perfInstance: any = null;
let initialized = false;
let fetchPatched = false;
let appStartupTrace: any = null;

function readFlag(name: string): boolean {
  return String(process.env[name] || "").trim() === "true";
}

function hasCoreFirebaseClientConfig(): boolean {
  const options = app.options;
  return Boolean(
    String(options.apiKey || "").trim() &&
      String(options.appId || "").trim() &&
      String(options.projectId || "").trim()
  );
}

function canEnablePerformance(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return readFlag("NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING");
}

function safeTraceName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 95);
}

async function ensurePerfReady(): Promise<{ mod: PerfModule; perf: any } | null> {
  if (!canEnablePerformance() || !hasCoreFirebaseClientConfig()) {
    return null;
  }

  if (!initialized) {
    initialized = true;
    try {
      const mod = await import("firebase/performance");
      perfModule = mod;
      perfInstance = mod.getPerformance(app);
    } catch (error) {
      console.error("Firebase Performance initialization failed:", error);
      return null;
    }
  }

  if (!perfModule || !perfInstance) {
    return null;
  }

  return { mod: perfModule, perf: perfInstance };
}

export async function initializeFirebasePerformance(): Promise<void> {
  await ensurePerfReady();
}

export async function startAppStartupPerformanceTrace(): Promise<void> {
  if (appStartupTrace || typeof window === "undefined") {
    return;
  }

  const ready = await ensurePerfReady();
  if (!ready) {
    return;
  }

  const { mod, perf } = ready;
  appStartupTrace = mod.trace(perf, "app_startup");
  appStartupTrace.start();

  const stopStartupTrace = () => {
    if (!appStartupTrace) {
      return;
    }
    try {
      appStartupTrace.putMetric("load_event_ms", Math.max(0, Math.round(performance.now())));
      appStartupTrace.stop();
    } catch {
      // no-op
    }
    appStartupTrace = null;
  };

  if (document.readyState === "complete") {
    stopStartupTrace();
    return;
  }

  window.addEventListener("load", stopStartupTrace, { once: true });
}

async function startApiTrace(method: string, pathname: string) {
  const ready = await ensurePerfReady();
  if (!ready) {
    return null;
  }

  const { mod, perf } = ready;
  const trace = mod.trace(perf, safeTraceName(`api_${method}_${pathname}`));
  trace.putAttribute("method", method);
  trace.putAttribute("path", pathname.slice(0, 95));
  trace.start();
  return trace;
}

function isApiUrl(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname.startsWith("/api/");
}

export function instrumentClientFetchWithPerformance(): void {
  if (typeof window === "undefined" || fetchPatched) {
    return;
  }
  fetchPatched = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let request = new Request(input, init);
    const url = new URL(request.url, window.location.origin);

    if (!isApiUrl(url)) {
      return nativeFetch(request);
    }

    try {
      const appCheckToken = await getFirebaseAppCheckToken();
      if (appCheckToken) {
        const headers = new Headers(request.headers);
        if (!headers.has("X-Firebase-AppCheck")) {
          headers.set("X-Firebase-AppCheck", appCheckToken);
        }
        request = new Request(request, { headers });
      }
    } catch {
      // App Check token is best-effort when not enforced.
    }

    const method = (request.method || "GET").toUpperCase();
    const trace = await startApiTrace(method, url.pathname);
    const start = performance.now();

    try {
      const response = await nativeFetch(request);
      if (trace) {
        trace.putMetric("status_code", response.status);
        trace.putMetric("latency_ms", Math.max(0, Math.round(performance.now() - start)));
      }
      return response;
    } catch (error) {
      if (trace) {
        trace.putMetric("status_code", 0);
        trace.putMetric("latency_ms", Math.max(0, Math.round(performance.now() - start)));
      }
      throw error;
    } finally {
      trace?.stop();
    }
  };
}

export async function trackScreenRenderPerformance(pathname: string): Promise<void> {
  if (typeof window === "undefined" || !pathname) {
    return;
  }

  const ready = await ensurePerfReady();
  if (!ready) {
    return;
  }

  const { mod, perf } = ready;
  const trace = mod.trace(perf, safeTraceName(`screen_render_${pathname}`));
  trace.putAttribute("screen", pathname.slice(0, 95));
  trace.start();

  const start = performance.now();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        const duration = Math.max(0, Math.round(performance.now() - start));
        trace.putMetric("render_ms", duration);
        trace.putMetric("is_slow_screen", duration > 1200 ? 1 : 0);
      } finally {
        trace.stop();
      }
    });
  });
}
