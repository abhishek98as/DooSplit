"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  ArrowLeft,
  Bot,
  User,
  Brain,
  Check,
  X,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { authFetch } from "@/lib/auth/client-session";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

const STARTER_PROMPTS = [
  "Summarize my recent spending by category.",
  "Who owes me the most right now?",
  "Project my spending for the next 3 months.",
  "List my groups and trips with balances.",
  "Show my notes and suggest a shopping list note.",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

function parseBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-bold text-neutral-950 dark:text-white">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

function formatMessage(text: string) {
  return text.split("\n").map((line, i) => {
    const cleanLine = line.trim();
    if (!cleanLine) return <div key={i} className="h-2" />;

    if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
      return (
        <li
          key={i}
          className="ml-5 list-disc my-1 text-xs sm:text-sm text-neutral-800 dark:text-neutral-300"
        >
          {parseBold(cleanLine.substring(2))}
        </li>
      );
    }
    if (cleanLine.startsWith("### ")) {
      return (
        <h3
          key={i}
          className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white mt-3 mb-1"
        >
          {parseBold(cleanLine.substring(4))}
        </h3>
      );
    }
    if (cleanLine.startsWith("## ")) {
      return (
        <h2
          key={i}
          className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white mt-4 mb-2"
        >
          {parseBold(cleanLine.substring(3))}
        </h2>
      );
    }
    return (
      <p
        key={i}
        className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-300 my-1 leading-relaxed"
      >
        {parseBold(cleanLine)}
      </p>
    );
  });
}

function newId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveThinking, setLiveThinking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<{ question: string; options: string[] } | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    preview: string;
    pendingId: string;
  } | null>(null);
  const [weeklyLimitOpen, setWeeklyLimitOpen] = useState(false);
  const [weeklyUsage, setWeeklyUsage] = useState<{
    tokensUsed: number;
    limit: number;
    resetsAt?: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isThinking, liveThinking, options, pendingAction]);

  const runStream = useCallback(
    async (payload: Record<string, unknown>, assistantId: string) => {
      setIsLoading(true);
      setIsThinking(true);
      setLiveThinking("");
      setError(null);
      setOptions(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await authFetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.code === "AI_WEEKLY_LIMIT") {
            setWeeklyUsage(data.usage || null);
            setWeeklyLimitOpen(true);
            setMessages((prev) =>
              prev.filter((m) => !(m.id === assistantId && !m.content))
            );
            return;
          }
          throw new Error(data.error || "AI is temporarily unavailable");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("AI is temporarily unavailable");

        const decoder = new TextDecoder();
        let buffer = "";
        let gotText = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            let event: any;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }

            if (event.type === "thinking") {
              setIsThinking(true);
              setLiveThinking((prev) => (prev + (event.delta || "")).slice(-2000));
            } else if (event.type === "text") {
              gotText = true;
              setIsThinking(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + (event.delta || "") }
                    : m
                )
              );
            } else if (event.type === "options") {
              setOptions({
                question: String(event.question || "Choose an option"),
                options: Array.isArray(event.options) ? event.options.map(String) : [],
              });
            } else if (event.type === "pending_action") {
              setPendingAction({
                preview: String(event.preview || "Confirm change"),
                pendingId: String(event.pendingId || ""),
              });
            } else if (event.type === "error") {
              setError(String(event.message || "AI is temporarily unavailable"));
            } else if (event.type === "limit") {
              setWeeklyUsage(event.usage || null);
              setWeeklyLimitOpen(true);
            } else if (event.type === "done") {
              setIsThinking(false);
            }
          }
        }

        if (!gotText) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.content
                ? { ...m, content: "Done. Ask a follow-up if you need more." }
                : m
            )
          );
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "AI is temporarily unavailable");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && !m.content
              ? { ...m, content: "Sorry — I could not complete that request." }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        setIsThinking(false);
      }
    },
    []
  );

  const sendUserMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", content: trimmed };
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "" };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, assistantMsg]);
    setInput("");
    setPendingAction(null);

    await runStream(
      {
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      },
      assistantMsg.id
    );
  };

  const handleConfirm = async (confirm: boolean) => {
    if (isLoading) return;
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "" };
    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: confirm ? "Confirm" : "Cancel",
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setPendingAction(null);
    await runStream(
      {
        messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        confirmAction: confirm,
        cancelAction: !confirm,
      },
      assistantMsg.id
    );
  };

  const handleOption = (option: string) => {
    setOptions(null);
    void sendUserMessage(option);
  };

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-120px)] md:h-[calc(100vh-64px)] mb-[-80px] md:mb-[-24px] w-full bg-neutral-50 dark:bg-dark-bg overflow-hidden transition-all">
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-xl md:hidden"
            >
              <ArrowLeft className="h-5 w-5 text-neutral-600 dark:text-dark-text-secondary" />
            </Link>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-coral text-white flex items-center justify-center shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold font-display text-neutral-900 dark:text-white leading-tight">
                DooSplit AI Assistant
              </h1>
              <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-dark-text-tertiary">
                Chat with your expenses, groups, trips & notes
              </p>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6 px-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold font-display text-neutral-900 dark:text-white">
                  Meet your Expense Assistant
                </h2>
                <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-1.5 leading-relaxed">
                  Ask follow-ups, project spending, and let me create or update expenses and notes after you confirm.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(prompt)}
                    className="p-3 text-left bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl text-xs hover:border-primary dark:hover:border-primary hover:shadow-sm transition-all text-neutral-700 dark:text-dark-text-secondary font-medium"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isAi = message.role === "assistant";
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 max-w-[85%] ${isAi ? "" : "ml-auto flex-row-reverse"}`}
                >
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                      isAi
                        ? "bg-gradient-to-br from-primary to-coral text-white"
                        : "bg-neutral-200 dark:bg-dark-bg-tertiary text-neutral-700 dark:text-dark-text"
                    }`}
                  >
                    {isAi ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2.5 shadow-sm border ${
                      isAi
                        ? "bg-white dark:bg-dark-bg-secondary border-neutral-200 dark:border-dark-border text-neutral-800 dark:text-dark-text"
                        : "bg-primary text-white border-primary"
                    }`}
                  >
                    {isAi ? (
                      <div className="space-y-1">
                        {message.content ? (
                          formatMessage(message.content)
                        ) : isLoading ? (
                          <span className="text-xs text-neutral-400">…</span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {(isThinking || (isLoading && liveThinking)) && (
            <div className="flex gap-3 max-w-[90%]">
              <div className="h-8 w-8 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
                <Brain className="h-4 w-4 animate-pulse" />
              </div>
              <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/40 rounded-2xl px-4 py-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                    Thinking…
                  </span>
                </div>
                {liveThinking && (
                  <p className="text-[10px] text-violet-600/80 dark:text-violet-300/70 line-clamp-3 whitespace-pre-wrap">
                    {liveThinking.slice(-400)}
                  </p>
                )}
              </div>
            </div>
          )}

          {options && options.options.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-3 space-y-2 max-w-lg">
              <p className="text-xs font-medium text-neutral-800 dark:text-dark-text">
                {options.question}
              </p>
              <div className="flex flex-wrap gap-2">
                {options.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleOption(opt)}
                    className="min-h-10 px-3.5 py-2 rounded-xl text-sm font-semibold border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-50"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pendingAction && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3 max-w-lg space-y-2">
              <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                Confirm change: {pendingAction.preview}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleConfirm(true)}
                  className="flex-1 min-h-11 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Confirm
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleConfirm(false)}
                  className="flex-1 min-h-11 py-2.5 rounded-xl border border-neutral-200 dark:border-dark-border text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl text-center text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="p-3 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendUserMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Ask about expenses, groups, trips, notes…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || weeklyLimitOpen}
              className="flex-1 px-4 py-2.5 bg-neutral-100 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-xl text-xs sm:text-sm focus:outline-none focus:border-primary text-neutral-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isLoading || weeklyLimitOpen || !input.trim()}
              className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary hover:bg-primary-dark text-white flex items-center justify-center shadow-md active:scale-95 transition-all disabled:opacity-50 shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>

      <Modal
        isOpen={weeklyLimitOpen}
        onClose={() => setWeeklyLimitOpen(false)}
        title="Weekly AI limit"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 p-4">
            <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-dark-text">
                Weekly limit exhausted
              </p>
              <p className="mt-1 text-xs text-neutral-600 dark:text-dark-text-secondary leading-relaxed">
                You&apos;ve used your 10,000 AI tokens for this week
                {weeklyUsage
                  ? ` (${weeklyUsage.tokensUsed?.toLocaleString?.() || weeklyUsage.tokensUsed} / ${(weeklyUsage.limit || 10000).toLocaleString()})`
                  : ""}
                . Your limit resets next Monday.
              </p>
            </div>
          </div>
          <Button className="w-full" onClick={() => setWeeklyLimitOpen(false)}>
            Got it
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
