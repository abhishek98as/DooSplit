"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  Activity,
  Plus,
  Receipt,
  Wallet,
  Notebook,
} from "lucide-react";

const TABS = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/expenses", icon: Receipt, label: "Expenses" },
  { href: "/friends", icon: Users, label: "Friends" },
  { href: "/activity", icon: Activity, label: "Activity" },
  { href: "/settlements", icon: Wallet, label: "Settlements" },
  { href: "/notes", icon: Notebook, label: "Notes" },
];

const MobileNav: React.FC = () => {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const showFab =
    !isActive("/notes") &&
    !isActive("/expenses") &&
    !isActive("/friends") &&
    !isActive("/activity") &&
    !isActive("/settlements");

  return (
    <>
      {/* ── Floating Action Button (Add Expense) — hidden on specific pages ──── */}
      {showFab && (
        <Link
          href="/expenses/add"
          className="md:hidden fixed bottom-20 right-4 h-14 w-14 bg-primary text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform z-35"
          aria-label="Add expense"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}

      {/* ── Bottom Navigation Bar ──────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border shadow-lg z-40 safe-area-inset-bottom overflow-x-auto">
        <div className="flex items-center justify-around h-16 min-w-max px-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors px-1 min-w-[52px] ${
                  active
                    ? "text-primary font-semibold"
                    : "text-neutral-500 dark:text-dark-text-tertiary hover:text-neutral-700 dark:hover:text-dark-text"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[9px] font-medium leading-none whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default MobileNav;
