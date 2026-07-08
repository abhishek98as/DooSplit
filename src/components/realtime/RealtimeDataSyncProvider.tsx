"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/react-session";

type RealtimeDomain =
  | "expenses"
  | "friends"
  | "groups"
  | "settlements"
  | "analytics"
  | "activity";

interface DataUpdatedEventDetail {
  domains: RealtimeDomain[];
  reason: string;
  at: number;
}

function emitDataUpdated(detail: DataUpdatedEventDetail) {
  window.dispatchEvent(new CustomEvent("doosplit:data-updated", { detail }));
}

// â”€â”€ SSE Connection (primary: real-time via EventSource) â”€â”€

function connectSSE(
  userId: string,
  lastEventAt: string,
  onDisconnect: () => void
): { close: () => void } {
  const url = `/api/realtime/events?since=${encodeURIComponent(lastEventAt)}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "data-updated") {
        emitDataUpdated({
          domains: (data.domains as RealtimeDomain[]) || ["activity"],
          reason: data.reason || "Data changed",
          at: Date.now(),
        });
      } else if (data.type === "reconnect") {
        source.close();
        onDisconnect();
      }
    } catch {
      // Ignore malformed events
    }
  };

  source.onerror = () => {
    source.close();
    onDisconnect();
  };

  return { close: () => source.close() };
}

// â”€â”€ Polling fallback â”€â”€

function startPolling(
  userId: string,
  intervalMs: number,
  stopSignal: { current: boolean }
) {
  const poll = () => {
    if (stopSignal.current) return;

    emitDataUpdated({
      domains: ["activity"],
      reason: "Polling refresh",
      at: Date.now(),
    });

    if (!stopSignal.current) {
      setTimeout(poll, intervalMs);
    }
  };

  setTimeout(poll, intervalMs);
}

// â”€â”€ Provider â”€â”€

interface RealtimeDataSyncProviderProps {
  children: React.ReactNode;
}

export function RealtimeDataSyncProvider({ children }: RealtimeDataSyncProviderProps) {
  const { data: session, status } = useSession();
  const sseRef = useRef<{ close: () => void } | null>(null);
  const pollStopRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const userId = session.user.id;
    const lastEventAt = new Date(Date.now() - 60_000).toISOString(); // last 60s

    // Try SSE first
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const startSSE = () => {
      sseRef.current?.close();
      sseRef.current = connectSSE(userId, lastEventAt, () => {
        // SSE disconnected â€” fall back to polling after 5s delay
        reconnectTimer = setTimeout(() => {
          pollStopRef.current = false;
          startPolling(userId, 30_000, pollStopRef);
          // Retry SSE after 60s
          setTimeout(() => {
            pollStopRef.current = true;
            startSSE();
          }, 60_000);
        }, 5_000);
      });
    };

    startSSE();

    return () => {
      sseRef.current?.close();
      pollStopRef.current = true;
      clearTimeout(reconnectTimer);
    };
  }, [status, session?.user?.id]);

  return <>{children}</>;
}

export default RealtimeDataSyncProvider;
