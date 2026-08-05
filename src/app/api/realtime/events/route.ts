/**
 * Real-time events endpoint — SSE (Server-Sent Events)
 * Polls DynamoDB activity logs for the authenticated user.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { queryActivitiesForUser } from "@/lib/dynamodb/entities/activities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 15_000;
const MAX_CONNECTION_MS = 5 * 60_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) {
    return auth.response as NextResponse;
  }

  const userId = auth.user.id;
  const lastEventAt = request.nextUrl.searchParams.get("since") || new Date(0).toISOString();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastKnownTimestamp = new Date(lastEventAt);
      const startedAt = Date.now();

      const sendEvent = (data: Record<string, unknown>) => {
        const event = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(event));
      };

      sendEvent({ type: "connected", userId, at: new Date().toISOString() });

      const poll = async () => {
        try {
          if (Date.now() - startedAt > MAX_CONNECTION_MS) {
            sendEvent({ type: "reconnect", reason: "max_connection_time" });
            controller.close();
            return;
          }

          const { items } = await queryActivitiesForUser(userId, 5);
          const newActivities = items.filter((a) => {
            const created = new Date(a.createdAt || 0).getTime();
            return created > lastKnownTimestamp.getTime();
          });

          if (newActivities.length > 0) {
            lastKnownTimestamp = new Date(
              Math.max(
                ...newActivities.map((a) => new Date(a.createdAt || 0).getTime())
              )
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

      await poll();
      const interval = setInterval(poll, POLL_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
