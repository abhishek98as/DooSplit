"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "@/lib/auth/react-session";

export type UserPlan = "free" | "pro";

interface ProAccessContextValue {
  plan: UserPlan;
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  requirePro: (featureLabel?: string) => boolean;
  upgradeOpen: boolean;
  upgradeFeature: string | null;
  openUpgrade: (featureLabel?: string) => void;
  closeUpgrade: () => void;
}

const ProAccessContext = createContext<ProAccessContextValue | undefined>(undefined);

function resolveClientPlan(user: any): UserPlan {
  if (!user) return "free";
  if (String(user.plan || "").toLowerCase() !== "pro") return "free";
  if (user.planExpiresAt) {
    const expires = new Date(user.planExpiresAt).getTime();
    if (Number.isFinite(expires) && expires < Date.now()) return "free";
  }
  return "pro";
}

export function ProAccessProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [plan, setPlan] = useState<UserPlan>("free");
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !session?.user?.id) {
      setPlan("free");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPlan(resolveClientPlan(data.user));
      } else {
        setPlan("free");
      }
    } catch {
      setPlan("free");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openUpgrade = useCallback((featureLabel?: string) => {
    setUpgradeFeature(featureLabel || null);
    setUpgradeOpen(true);
  }, []);

  const closeUpgrade = useCallback(() => {
    setUpgradeOpen(false);
    setUpgradeFeature(null);
  }, []);

  const requirePro = useCallback(
    (featureLabel?: string) => {
      if (plan === "pro") return true;
      openUpgrade(featureLabel);
      return false;
    },
    [plan, openUpgrade]
  );

  const value = useMemo(
    () => ({
      plan,
      isPro: plan === "pro",
      loading,
      refresh,
      requirePro,
      upgradeOpen,
      upgradeFeature,
      openUpgrade,
      closeUpgrade,
    }),
    [
      plan,
      loading,
      refresh,
      requirePro,
      upgradeOpen,
      upgradeFeature,
      openUpgrade,
      closeUpgrade,
    ]
  );

  return (
    <ProAccessContext.Provider value={value}>{children}</ProAccessContext.Provider>
  );
}

export function useProAccess(): ProAccessContextValue {
  const ctx = useContext(ProAccessContext);
  if (!ctx) {
    return {
      plan: "free",
      isPro: false,
      loading: false,
      refresh: async () => {},
      requirePro: () => false,
      upgradeOpen: false,
      upgradeFeature: null,
      openUpgrade: () => {},
      closeUpgrade: () => {},
    };
  }
  return ctx;
}
