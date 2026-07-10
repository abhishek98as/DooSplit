"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Settings, Moon, Sun, Search, X, UsersRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NotificationDropdown from "./NotificationDropdown";
import { useTheme } from "@/contexts/ThemeContext";
import OfflineIndicator from "@/components/pwa/OfflineIndicator";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import BrandLogo from "@/components/ui/BrandLogo";
import { useSession } from "@/lib/auth/react-session";

interface AppShellProps {
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/expenses": "Expenses",
  "/expenses/add": "Add Expense",
  "/friends": "Friends",
  "/groups": "Groups",
  "/settlements": "Settlements",
  "/analytics": "Analytics",
  "/activity": "Activity",
  "/notes": "Notes",
  "/settings": "Settings",
  "/invite": "Invite Friends",
  "/conflicts": "Conflicts",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.entries(PAGE_TITLES).find(([key]) =>
    key !== "/dashboard" && pathname.startsWith(key + "/")
  );
  return match ? match[1] : "DooSplit";
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const pageTitle = getPageTitle(pathname);

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
          <header className="md:hidden sticky top-0 z-30 min-h-14 bg-white border-b border-neutral-200 py-2">
            <div className="flex items-center justify-between h-full px-4 gap-2">
              <Link href="/dashboard" className="flex items-center gap-2 min-w-0 flex-1">
                <BrandLogo size={32} className="h-8 w-8 rounded-lg" priority />
                <span className="text-h4 font-bold font-display text-neutral-900 truncate">DooSplit</span>
              </Link>
              <div className="flex items-center space-x-1 shrink-0">
                <Link href="/expenses?focus=search" className="p-2 rounded-lg text-neutral-500" aria-label="Search">
                  <Search className="h-5 w-5" />
                </Link>
                <Link href="/settings" className="p-2 rounded-lg text-neutral-500">
                  <Settings className="h-5 w-5" />
                </Link>
                <NotificationDropdown />
              </div>
            </div>
          </header>

          {/* Desktop Topbar — SSR placeholder (no theme toggle) */}
          <header className="hidden md:flex ds-topbar bg-white/90 border-neutral-200">
            <h1 className="font-display font-bold text-[22px] text-neutral-900 tracking-tight">{pageTitle}</h1>
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

          <main className="pb-20 md:pb-6">{children}</main>
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
        <header className="md:hidden sticky top-0 z-30 min-h-14 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border py-2">
          <div className="flex items-center justify-between h-full px-4 gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link href="/settings" className="flex items-center shrink-0">
                <div className="h-9 w-9 rounded-full overflow-hidden flex items-center justify-center bg-primary text-white text-xs font-bold shadow-sm border border-neutral-200 dark:border-dark-border">
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
              </Link>
              <Link href="/dashboard" className="min-w-0 flex flex-col leading-tight">
                <span className="text-h4 font-bold font-display text-neutral-900 dark:text-dark-text truncate">
                  DooSplit
                </span>
                {firstName ? (
                  <span className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate">
                    Hi, {firstName}
                  </span>
                ) : null}
              </Link>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg transition-colors text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                type="button"
              >
                {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
              <Link
                href="/groups"
                className={`p-2 rounded-lg transition-colors ${
                  pathname === "/groups"
                    ? "text-primary bg-primary/10"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                }`}
                title="Groups"
              >
                <UsersRound className="h-5 w-5" />
              </Link>
              <NotificationDropdown />
              <Link
                href="/settings"
                className={`p-2 rounded-lg transition-colors ${
                  pathname === "/settings"
                    ? "text-primary bg-primary/10"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                }`}
              >
                <Settings className="h-5 w-5" />
              </Link>
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
          {/* Left: page title */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-display font-bold text-[22px] tracking-tight truncate">
              {pageTitle}
            </h1>
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
        <main className="pb-20 md:pb-6 min-w-0">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* PWA Components */}
      <OfflineIndicator position="top" />
      <InstallPrompt variant="toast" position="top" />
    </div>
  );
};

export default AppShell;

