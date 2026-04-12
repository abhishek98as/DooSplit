"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Receipt,
  BarChart3,
  Wallet,
  UserPlus,
  LayoutGrid,
  X,
} from "lucide-react";

// Primary tabs shown in the bottom bar (4 + FAB)
const PRIMARY_TABS = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/friends", icon: Users, label: "Friends" },
  { href: "/expenses", icon: Receipt, label: "Expenses" },
];

// Items shown in the "More" bottom sheet (right of FAB)
const MORE_ITEMS = [
  { href: "/groups", icon: UsersRound, label: "Groups" },
  { href: "/settlements", icon: Wallet, label: "Settlements" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/activity", icon: Activity, label: "Activity" },
  { href: "/invite", icon: UserPlus, label: "Invite Friends" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

const MobileNav: React.FC = () => {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  // Close sheet on route change
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!sheetOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sheetOpen]);

  // Is the current page one of the "More" items (highlight the More tab)
  const isMoreActive = MORE_ITEMS.some((item) => isActive(item.href));

  return (
    <>
      {/* ── Bottom Navigation Bar ──────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border shadow-lg z-40 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16">
          {/* Left tabs (Home, Friends) */}
          {PRIMARY_TABS.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors ${
                  isActive(item.href)
                    ? "text-primary"
                    : "text-neutral-500 dark:text-dark-text-tertiary"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* FAB — Add Expense */}
          <Link
            href="/expenses/add"
            className="group flex items-center justify-center -mt-8 h-14 w-14 bg-primary text-white rounded-2xl shadow-xl hover:bg-primary-dark transition-all duration-300"
            aria-label="Add expense"
          >
            <div className="relative">
              <BrandLogo size={34} className="h-[34px] w-[34px] rounded-xl" />
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-white text-primary flex items-center justify-center shadow-sm">
                <Plus className="h-3 w-3" />
              </span>
            </div>
          </Link>

          {/* Right tab — Expenses */}
          {PRIMARY_TABS.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors ${
                  isActive(item.href)
                    ? "text-primary"
                    : "text-neutral-500 dark:text-dark-text-tertiary"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* More tab */}
          <button
            type="button"
            onClick={() => setSheetOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors ${
              isMoreActive || sheetOpen
                ? "text-primary"
                : "text-neutral-500 dark:text-dark-text-tertiary"
            }`}
            aria-label="More pages"
            aria-expanded={sheetOpen}
          >
            <LayoutGrid className="h-6 w-6" />
            <span className="text-[11px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* ── "More" Bottom Sheet ────────────────────────────────────────── */}
      {/* Backdrop */}
      {sheetOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`md:hidden fixed left-0 right-0 bottom-16 z-50 bg-white dark:bg-dark-bg-secondary rounded-t-2xl shadow-2xl border-t border-neutral-200 dark:border-dark-border transition-transform duration-300 ease-out ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        aria-modal="true"
        role="dialog"
        aria-label="More navigation"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-dark-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="font-display font-bold text-base text-neutral-900 dark:text-dark-text">
            More
          </span>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Grid of items */}
        <div className="grid grid-cols-3 gap-3 px-4 pb-6 pt-2">
          {MORE_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "bg-neutral-50 dark:bg-dark-bg text-neutral-600 dark:text-dark-text-secondary hover:bg-primary/5 hover:text-primary"
                }`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-[12px] font-medium text-center leading-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default MobileNav;
