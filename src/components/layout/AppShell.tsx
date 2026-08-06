"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Settings, Moon, Sun, Search, X, Sparkles, RefreshCw, Activity, UserPlus, Menu, ArrowRightLeft, BarChart3, Notebook } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav, { OPEN_MENU_EVENT } from "./MobileNav";
import NotificationDropdown from "./NotificationDropdown";
import { useTheme } from "@/contexts/ThemeContext";
import OfflineIndicator from "@/components/pwa/OfflineIndicator";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import BrandLogo from "@/components/ui/BrandLogo";
import { useSession } from "@/lib/auth/react-session";

interface AppShellProps {
  children: React.ReactNode;
}

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "" },
  "/expenses": { title: "Expenses", subtitle: "Track and manage shared expenses" },
  "/expenses/add": { title: "Add Expense", subtitle: "Record a new shared expense" },
  "/friends": { title: "Friends", subtitle: "Manage your friends and connections" },
  "/groups": { title: "Groups", subtitle: "Organize expenses by groups" },
  "/settlements": { title: "Settlements", subtitle: "Settle up and clear balances" },
  "/analytics": { title: "Analytics", subtitle: "Insights into your spending" },
  "/activity": { title: "Activity", subtitle: "Recent actions and updates" },
  "/notes": { title: "Notes", subtitle: "Lists, reminders & quick thoughts" },
  "/settings": { title: "Settings", subtitle: "Manage your account and preferences" },
  "/invite": { title: "Invite Friends", subtitle: "Invite others to join DooSplit" },
  "/conflicts": { title: "Conflicts", subtitle: "Resolve expense discrepancies" },
};

function getPageMeta(pathname: string): { title: string; subtitle: string } {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  const match = Object.entries(PAGE_META).find(([key]) =>
    key !== "/dashboard" && pathname.startsWith(key + "/")
  );
  return match ? match[1] : { title: "DooSplit", subtitle: "" };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { data: session } = useSession();
  const firstName = session?.user?.name?.trim()?.split(/\s+/)[0] ?? "";
  const displayName = session?.user?.name?.trim() || "User";
  const initials = getInitials(displayName) || "U";

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const openMenu = () => setIsMobileMenuOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, openMenu);
    return () => window.removeEventListener(OPEN_MENU_EVENT, openMenu);
  }, []);

  const pageMeta = getPageMeta(pathname);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/expenses?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-cream">
        <Sidebar />
        <div className="md:pl-64">
          {/* Mobile Header */}
          <header className="md:hidden sticky top-0 z-30 min-h-16 bg-white border-b border-neutral-200 py-2">
            <div className="flex items-center justify-between h-full px-4 gap-2">
              <Link href="/dashboard" className="flex items-center gap-2 min-w-0 flex-1">
                <BrandLogo size={32} className="h-8 w-8 rounded-lg" priority />
                <span className="text-h4 font-bold font-display text-neutral-900 truncate">DooSplit</span>
              </Link>
              <div className="flex items-center gap-0.5 shrink-0">
                <Link href="/expenses?focus=search" className="touch-target p-3 rounded-xl text-neutral-500" aria-label="Search">
                  <Search className="h-5 w-5" />
                </Link>
                <Link href="/settings" className="touch-target p-3 rounded-xl text-neutral-500" aria-label="Settings">
                  <Settings className="h-5 w-5" />
                </Link>
                <NotificationDropdown />
              </div>
            </div>
          </header>

          {/* Desktop Topbar — SSR placeholder (no theme toggle) */}
          <header className="hidden md:flex ds-topbar bg-white/90 border-neutral-200">
            <h1 className="font-display font-bold text-[22px] text-neutral-900 tracking-tight">{pageMeta.title}</h1>
            <div className="flex items-center gap-2">
              <div className="ds-search border-neutral-200 bg-neutral-50">
                <Search className="h-4 w-4 text-neutral-400 flex-shrink-0" />
                <span className="font-sans text-sm text-neutral-400">Search expenses…</span>
              </div>
              <div className="ds-vdivider bg-neutral-200" />
              <div className="ds-icon-btn border-neutral-200 text-neutral-500"><Moon className="h-4 w-4" /></div>
              <NotificationDropdown />
              <div className="ds-vdivider bg-neutral-200" />
              <div className="ds-topbar-avatar text-white text-sm font-bold">{initials}</div>
            </div>
          </header>

          <main className="pb-24 md:pb-6">{children}</main>
        </div>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream dark:bg-dark-bg">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="md:pl-64 overflow-x-hidden">
        {/* ── Mobile Header (hidden on desktop) ──────────────────────────── */}
        <header className="md:hidden sticky top-0 z-30 min-h-16 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border py-2">
          <div className="flex items-center justify-between h-full px-4 gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="touch-target flex items-center shrink-0 focus:outline-none rounded-full"
                aria-label="Open menu"
              >
                <div className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center bg-primary text-white text-sm font-bold shadow-sm border border-neutral-200 dark:border-dark-border active:scale-95 transition-transform">
                  {session?.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
              </button>
              <Link href="/dashboard" className="min-w-0 flex flex-col leading-tight">
                <span className="text-h4 font-bold font-display text-neutral-900 dark:text-dark-text truncate">
                  DooSplit
                </span>
                {firstName ? (
                  <span className="text-caption text-neutral-500 dark:text-dark-text-tertiary truncate">
                    Hi, {firstName}
                  </span>
                ) : null}
              </Link>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={toggleTheme}
                className="touch-target p-3 rounded-xl transition-colors text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                type="button"
              >
                {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
              <NotificationDropdown />
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className={`touch-target p-3 rounded-xl transition-colors ${
                  isMobileMenuOpen
                    ? "text-primary bg-primary/10"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                }`}
                title="Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* ── Desktop Topbar (hidden on mobile) ──────────────────────────── */}
        <header
          className={`hidden md:flex ds-topbar ${
            theme === "light"
              ? "bg-white/90 border-neutral-200 text-neutral-900"
              : "bg-dark-bg-secondary/90 border-dark-border text-dark-text"
          }`}
        >
          {/* Left: page title + subtitle */}
          <div className="flex flex-col min-w-0">
            <h1 className="font-display font-bold text-[22px] tracking-tight truncate">
              {pageMeta.title}
            </h1>
            {pageMeta.subtitle && pageMeta.title !== "Dashboard" && (
              <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate mt-0.5">
                {pageMeta.subtitle}
              </p>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              className={`ds-icon-btn ${
                theme === "light"
                  ? "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  : "border-dark-border text-dark-text-secondary hover:bg-dark-bg"
              }`}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Notification bell */}
            <NotificationDropdown />

            {/* Vertical divider */}
            <div className={`ds-vdivider ${theme === "light" ? "bg-neutral-200" : "bg-dark-border"}`} />

            {/* Settings */}
            <Link
              href="/settings"
              className={`ds-icon-btn ${
                theme === "light"
                  ? "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  : "border-dark-border text-dark-text-secondary hover:bg-dark-bg"
              }`}
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>

            {/* User avatar — links to settings */}
            <Link href="/settings" title={displayName}>
              <div className="ds-topbar-avatar overflow-hidden flex items-center justify-center border border-neutral-200 dark:border-dark-border bg-primary/10">
                {session?.user?.image ? (
                  <img
                    src={session.user.image}
                    alt={displayName}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-white dark:text-dark-text font-bold text-sm">{initials}</span>
                )}
              </div>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="pb-24 md:pb-6 min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* PWA Components */}
      <OfflineIndicator position="top" />
      <InstallPrompt variant="toast" position="top" />
      {/* Mobile Drawer Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(-100%); }
              to { transform: translateX(0); }
            }
            .animate-slide-in {
              animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>

          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative flex w-full max-w-xs flex-col bg-white dark:bg-dark-bg-secondary p-6 shadow-2xl transition-transform duration-300 animate-slide-in">
            {/* Header: Profile & Close */}
            <div className="flex items-start justify-between border-b border-neutral-100 dark:border-dark-border pb-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center bg-primary text-white text-sm font-bold border border-neutral-200 dark:border-dark-border">
                  {session?.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="min-w-0 flex flex-col">
                  <span className="font-semibold text-neutral-950 dark:text-dark-text truncate">
                    {displayName}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate">
                    {session?.user?.email}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="touch-target p-3 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Menu Links */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {[
                { href: "/notes", label: "Notes", icon: Notebook },
                { href: "/ai-chat", label: "AI Chat", icon: Sparkles },
                { href: "/settlements", label: "Settlements", icon: ArrowRightLeft },
                { href: "/recurring-expenses", label: "Recurring Expenses", icon: RefreshCw },
                { href: "/analytics", label: "Analytics", icon: BarChart3 },
                { href: "/activity", label: "Activity", icon: Activity },
                { href: "/invite", label: "Invite Friends", icon: UserPlus },
                { href: "/settings", label: "Settings", icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all min-h-12 ${
                      active
                        ? "bg-primary text-white font-medium shadow-md shadow-primary/10"
                        : "text-neutral-700 dark:text-dark-text-secondary hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-body font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-neutral-100 dark:border-dark-border text-center">
              <span className="text-xs text-neutral-400">DooSplit v0.1.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppShell;

