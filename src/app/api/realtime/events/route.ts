/**
 * Real-time events endpoint — SSE (Server-Sent Events)
 *
 * For MongoDB Atlas free/shared tiers (M0/M2/M5), Change Streams are not available.
 * This endpoint uses periodic polling and emits events via SSE when data changes.
 *
 * For M10+ Atlas tiers, swap this with MongoDB Change Streams for true real-time.
 *
 * Client connects via EventSource, receives "data-updated" events when the
 * user's collections have changed since their last known timestamp.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerAppUser } from "@/lib/auth/server-session";
import { ActivityLog, ExpenseParticipant } from "@/lib/mongodb/models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const MAX_CONNECTION_MS = 5 * 60_000; // 5 minutes max per connection

export async function GET(request: NextRequest) {
  const user = await getServerAppUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const searchParams = request.nextUrl.searchParams;
  const lastEventAt = searchParams.get("since") || new Date(0).toISOString();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastKnownTimestamp = new Date(lastEventAt);
      const startedAt = Date.now();

      const sendEvent = (data: Record<string, unknown>) => {
        const event = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      // Send initial heartbeat
      sendEvent({ type: "connected", userId, at: new Date().toISOString() });

      // Poll for new activity
      const poll = async () => {
        try {
          // Check if we've exceeded max connection time
          if (Date.now() - startedAt > MAX_CONNECTION_MS) {
            sendEvent({ type: "reconnect", reason: "max_connection_time" });
            controller.close();
            return;
          }

          // Check for new activity logs since last known timestamp
          const newActivities = await ActivityLog.find({
            userId,
            createdAt: { $gt: lastKnownTimestamp },
          })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

          if (newActivities.length > 0) {
            lastKnownTimestamp = new Date(
              Math.max(...newActivities.map((a: any) => new Date(a.createdAt).getTime()))
            );

            sendEvent({
              type: "data-updated",
              domains: ["activities"],
              reason: `Found ${newActivities.length} new activities`,
              at: lastKnownTimestamp.toISOString(),
            });
          }
        } catch (err) {
          console.error("[realtime-events] Poll error:", err);
        }
      };

      // Initial poll
      await poll();

      // Set up polling interval
      const interval = setInterval(poll, POLL_INTERVAL_MS);

      // Cleanup on stream close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
