"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/ui/BrandLogo";
import {
  Home,
  Users,
  UsersRound,
  Activity,
  Settings,
  Plus,
  BarChart3,
  Wallet,
  UserPlus,
  Receipt,
  ChevronRight,
} from "lucide-react";
import { useSession } from "@/lib/auth/react-session";

const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", icon: Home, label: "Dashboard" },
      { href: "/expenses", icon: Receipt, label: "Expenses", badge: 0 },
      { href: "/friends", icon: Users, label: "Friends" },
      { href: "/groups", icon: UsersRound, label: "Groups" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/settlements", icon: Wallet, label: "Settlements" },
      { href: "/analytics", icon: BarChart3, label: "Analytics" },
    ],
  },
  {
    label: "Other",
    items: [
      { href: "/activity", icon: Activity, label: "Activity" },
      { href: "/invite", icon: UserPlus, label: "Invite Friends" },
      { href: "/settings", icon: Settings, label: "Settings" },
    ],
  },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const displayName = mounted ? (session?.user?.name?.trim() || "User") : "User";
  const email = mounted ? (session?.user?.email?.trim() || "") : "";
  const initials = getInitials(displayName) || "U";

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 ds-sidebar z-30 overflow-hidden">
      {/* Decorative teal glow — top left */}
      <div
        className="pointer-events-none absolute top-0 left-0 w-44 h-44"
        style={{ background: "radial-gradient(circle at top left, rgba(0,201,167,0.10) 0%, transparent 70%)" }}
        aria-hidden
      />

      {/* ── Brand — 68px, matches topbar height exactly ─────────────────── */}
      <div className="ds-sidebar-brand relative flex items-center gap-3 px-5 flex-shrink-0">
        <BrandLogo size={34} className="h-[34px] w-[34px] rounded-xl flex-shrink-0" priority />
        <span className="font-display font-extrabold text-white tracking-tight" style={{ fontSize: 18 }}>
          DooSplit
        </span>
      </div>

      {/* ── Add Expense CTA ───────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <Link
          href="/expenses/add"
          className="ds-sidebar-cta group flex items-center justify-center gap-2 w-full py-[11px] text-white font-display font-bold text-sm"
        >
          <Plus className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:rotate-45" />
          Add Expense
        </Link>
      </div>

      {/* ── Scrollable nav ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 scrollbar-hide relative">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            <p className="ds-section-label px-2 pt-3 pb-[6px]">{section.label}</p>

            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`ds-nav-item relative flex items-center gap-[11px] w-full px-3 py-[10px] mb-0.5 font-sans ${
                    active ? "ds-nav-item--active" : ""
                  }`}
                >
                  {active && <span className="ds-nav-accent" aria-hidden />}
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {"badge" in item && (item as any).badge > 0 && (
                    <span className="ml-auto bg-coral text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {(item as any).badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── User Profile — pinned bottom ──────────────────────────────────── */}
      <Link
        href="/settings"
        className="ds-user-profile relative flex items-center gap-[10px] px-4 py-3 flex-shrink-0 transition-colors duration-150"
      >
        <div className="ds-user-avatar flex items-center justify-center select-none">
          <span className="font-display font-bold text-white text-sm">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-sans font-semibold truncate text-[13px]" style={{ color: "rgba(255,255,255,0.85)" }}>
            {displayName}
          </p>
          <p className="font-sans font-normal truncate text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            {email || "View profile"}
          </p>
        </div>
        <ChevronRight className="flex-shrink-0 h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
      </Link>
    </aside>
  );
};

export default Sidebar;
