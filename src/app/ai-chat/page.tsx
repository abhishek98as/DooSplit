"use client";

import React, { useRef, useEffect } from "react";

export const dynamic = "force-dynamic";
import { useChat } from "@ai-sdk/react";
import { Sparkles, Send, Loader2, RefreshCw, ArrowLeft, Bot, User } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";

const STARTER_PROMPTS = [
  "Summarize my recent spending category breakdown.",
  "Who owes me the most money right now?",
  "Show me my recent settlements history.",
  "Give me spending tips based on my transaction history."
];

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
        <li key={i} className="ml-5 list-disc my-1 text-xs sm:text-sm text-neutral-800 dark:text-neutral-300">
          {parseBold(cleanLine.substring(2))}
        </li>
      );
    }
    if (cleanLine.startsWith("### ")) {
      return (
        <h3 key={i} className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white mt-3 mb-1">
          {parseBold(cleanLine.substring(4))}
        </h3>
      );
    }
    if (cleanLine.startsWith("## ")) {
      return (
        <h2 key={i} className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white mt-4 mb-2">
          {parseBold(cleanLine.substring(3))}
        </h2>
      );
    }
    return (
      <p key={i} className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-300 my-1 leading-relaxed">
        {parseBold(cleanLine)}
      </p>
    );
  });
}

export default function AiChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, reload, error } = useChat({
    api: "/api/ai/chat",
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStarterClick = (promptText: string) => {
    setInput(promptText);
  };

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-64px)] md:h-[calc(100vh-2px)] max-w-4xl mx-auto bg-neutral-50 dark:bg-dark-bg border-x border-neutral-200 dark:border-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-xl md:hidden">
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
                Ask about expenses, balances, and analytics
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => reload()}
              disabled={isLoading}
              className="p-2 border border-neutral-200 dark:border-dark-border hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-xl transition-all"
              title="Regenerate Last Response"
            >
              <RefreshCw className={`h-4 w-4 text-neutral-600 dark:text-dark-text-secondary ${isLoading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* Message Container */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto text-center space-y-6 px-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center animate-bounce">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold font-display text-neutral-900 dark:text-white">
                  Meet your Expense Assistant
                </h2>
                <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-1.5 leading-relaxed">
                  I can analyze your spending history, track who owes you money, list group distributions, and answer any questions about your DooSplit account.
                </p>
              </div>

              {/* Starter chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleStarterClick(prompt)}
                    className="p-3 text-left bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl text-xs hover:border-primary dark:hover:border-primary hover:shadow-sm transition-all text-neutral-700 dark:text-dark-text-secondary font-medium"
                  >
                    💡 {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message: any) => {
              const isAi = message.role === "assistant";
              return (
                <div key={message.id} className={`flex gap-3 max-w-[85%] ${isAi ? "" : "ml-auto flex-row-reverse"}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                    isAi
                      ? "bg-gradient-to-br from-primary to-coral text-white"
                      : "bg-neutral-200 dark:bg-dark-bg-tertiary text-neutral-700 dark:text-dark-text"
                  }`}>
                    {isAi ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div className={`rounded-2xl px-4 py-2.5 shadow-sm border ${
                    isAi
                      ? "bg-white dark:bg-dark-bg-secondary border-neutral-200 dark:border-dark-border text-neutral-800 dark:text-dark-text"
                      : "bg-primary text-white border-primary"
                  }`}>
                    {isAi ? (
                      <div className="space-y-1">{formatMessage(message.content)}</div>
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

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-coral text-white flex items-center justify-center shrink-0 animate-pulse">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-neutral-500 dark:text-dark-text-tertiary">Thinking...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl text-center text-xs text-red-600 dark:text-red-400">
              An error occurred: {error.message}. Please verify your GEMINI_API_KEY is configured.
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Ask anything about your expenses..."
              value={input}
              onChange={handleInputChange}
              className="flex-1 px-4 py-2.5 bg-neutral-100 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-xl text-xs sm:text-sm focus:outline-none focus:border-primary text-neutral-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isLoading || !input || !input.trim()}
              className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary hover:bg-primary-dark text-white flex items-center justify-center shadow-md active:scale-95 transition-all disabled:opacity-50 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
