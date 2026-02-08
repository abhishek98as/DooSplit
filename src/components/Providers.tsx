"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PWAProvider } from "@/components/pwa/PWAProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <PWAProvider>
          {children}
        </PWAProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
