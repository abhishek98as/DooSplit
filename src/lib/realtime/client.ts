"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface RealtimeEvent {
  source: "notifications" | "friend-requests";
  event: string;
  payload: any;
}

async function fetchRealtimeToken(): Promise<string | null> {
  const response = await fetch("/api/realtime/token", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data.token || null;
}

export async function subscribeToUserRealtime(
  userId: string,
  onEvent: (event: RealtimeEvent) => void
): Promise<() => void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return () => {};
  }

  const token = await fetchRealtimeToken();
  if (token) {
    supabase.realtime.setAuth(token);
  }

  const channels: RealtimeChannel[] = [];

  const notifications = supabase
    .channel(`user:${userId}:notifications`, {
      config: {
        private: true,
      },
    })
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onEvent({
          source: "notifications",
          event: payload.eventType,
          payload,
        });
      }
    )
    .subscribe();
  channels.push(notifications);

  const friendRequestsIncoming = supabase
    .channel(`user:${userId}:friend-requests:incoming`, {
      config: {
        private: true,
      },
    })
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `friend_id=eq.${userId}`,
      },
      (payload) => {
        onEvent({
          source: "friend-requests",
          event: payload.eventType,
          payload,
        });
      }
    )
    .subscribe();
  channels.push(friendRequestsIncoming);

  const friendRequestsOutgoing = supabase
    .channel(`user:${userId}:friend-requests:outgoing`, {
      config: {
        private: true,
      },
    })
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onEvent({
          source: "friend-requests",
          event: payload.eventType,
          payload,
        });
      }
    )
    .subscribe();
  channels.push(friendRequestsOutgoing);

  return () => {
    for (const channel of channels) {
      supabase.removeChannel(channel);
    }
  };
}
