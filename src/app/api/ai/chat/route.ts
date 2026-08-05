import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { requireUser } from "@/lib/auth/require-user";
import {
  AI_NOT_CONFIGURED,
  createDeepSeekClient,
  DEEPSEEK_MODEL,
  getDeepSeekApiKey,
  toSafeAiError,
} from "@/lib/ai/deepseek";
import { checkAiChatRateLimit } from "@/lib/ai/rate-limit";
import {
  AI_TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  executeAiTool,
} from "@/lib/ai/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ClientMessage = { role: string; content: string };

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    if (!getDeepSeekApiKey()) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    }

    const rate = checkAiChatRateLimit(auth.user.id);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Too many AI requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec || 60) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const messages: ClientMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const confirmAction = body.confirmAction === true;
    const cancelAction = body.cancelAction === true;

    if (messages.length === 0 && !confirmAction && !cancelAction) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const actor = {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
    };

    // Shortcut: UI Confirm / Cancel buttons
    if (confirmAction || cancelAction) {
      const result = await executeAiTool({
        actor,
        name: "confirm_pending_mutation",
        args: { confirm: confirmAction, cancel: cancelAction },
      });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const parsed = JSON.parse(result);
          if (parsed.status === "created" || parsed.status === "updated") {
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "text",
                  delta: `Done — ${parsed.status} ${parsed.label || "item"}${
                    parsed.expenseId || parsed.noteId || parsed.settlementId || parsed.groupId
                      ? ` (${parsed.expenseId || parsed.noteId || parsed.settlementId || parsed.groupId})`
                      : ""
                  }.\n`,
                })
              )
            );
          } else if (parsed.status === "cancelled") {
            controller.enqueue(
              encoder.encode(sse({ type: "text", delta: "Cancelled. No changes were made.\n" }))
            );
          } else {
            controller.enqueue(
              encoder.encode(
                sse({
                  type: "text",
                  delta: `${parsed.message || "Nothing to confirm."}\n`,
                })
              )
            );
          }
          controller.enqueue(encoder.encode(sse({ type: "done" })));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-24)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content).slice(0, 8000),
        })),
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(sse(payload)));
        };

        try {
          const client = createDeepSeekClient();
          let steps = 0;
          const maxSteps = 8;

          while (steps < maxSteps) {
            steps += 1;
            send({ type: "status", status: steps === 1 ? "thinking" : "working" });

            const completion = await client.chat.completions.create({
              model: DEEPSEEK_MODEL,
              messages: openaiMessages,
              tools: AI_TOOL_DEFINITIONS,
              tool_choice: "auto",
              max_tokens: 8192,
              stream: true,
              reasoning_effort: "high",
              // DeepSeek thinking mode
              ...( { thinking: { type: "enabled" } } as object ),
            } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);

            let assistantText = "";
            let reasoning = "";
            const toolCallBuffers = new Map<
              number,
              { id: string; name: string; arguments: string }
            >();

            for await (const chunk of completion) {
              const choice = chunk.choices[0];
              if (!choice) continue;
              const delta = choice.delta as OpenAI.Chat.ChatCompletionChunk.Choice.Delta & {
                reasoning_content?: string;
              };

              if (delta.reasoning_content) {
                reasoning += delta.reasoning_content;
                send({ type: "thinking", delta: delta.reasoning_content });
              }

              if (delta.content) {
                assistantText += delta.content;
                send({ type: "text", delta: delta.content });
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const existing = toolCallBuffers.get(idx) || {
                    id: tc.id || `call_${idx}`,
                    name: "",
                    arguments: "",
                  };
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name += tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                  toolCallBuffers.set(idx, existing);
                }
              }
            }

            const toolCalls = [...toolCallBuffers.values()].filter((t) => t.name);

            if (toolCalls.length === 0) {
              // Final assistant message
              if (assistantText) {
                openaiMessages.push({ role: "assistant", content: assistantText });
              }
              break;
            }

            // Append assistant message with tool calls
            openaiMessages.push({
              role: "assistant",
              content: assistantText || null,
              tool_calls: toolCalls.map((t) => ({
                id: t.id,
                type: "function" as const,
                function: { name: t.name, arguments: t.arguments || "{}" },
              })),
            });

            for (const tc of toolCalls) {
              send({ type: "tool", name: tc.name, status: "running" });
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.arguments || "{}");
              } catch {
                args = {};
              }

              const result = await executeAiTool({
                actor,
                name: tc.name,
                args,
                onEvent: (event) => {
                  if (event.type === "options") {
                    send({
                      type: "options",
                      question: event.question,
                      options: event.options,
                    });
                  }
                  if (event.type === "pending_action") {
                    send({
                      type: "pending_action",
                      preview: event.action.preview,
                      pendingId: event.action.id,
                      kind: event.action.kind,
                    });
                  }
                },
              });

              send({ type: "tool", name: tc.name, status: "done" });
              openaiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result.slice(0, 12000),
              });
            }

            // Continue loop so model can respond after tools
          }

          send({ type: "done" });
        } catch (err) {
          console.error("[ai/chat] stream error:", err);
          send({ type: "error", message: toSafeAiError(err) });
          send({ type: "done" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ai/chat] Error:", error);
    return NextResponse.json({ error: toSafeAiError(error) }, { status: 500 });
  }
}
