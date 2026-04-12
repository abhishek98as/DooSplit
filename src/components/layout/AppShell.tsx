"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Settings, Moon, Sun, Search, X } from "lucide-react";
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
      <div className="md:pl-64">
        {/* ── Mobile Header (hidden on desktop) ──────────────────────────── */}
        <header className="md:hidden sticky top-0 z-30 min-h-14 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border py-2">
          <div className="flex items-center justify-between h-full px-4 gap-2">
            <Link href="/dashboard" className="flex items-center gap-2 min-w-0 flex-1">
              <BrandLogo size={32} className="h-8 w-8 rounded-lg" priority />
              <div className="min-w-0 flex flex-col leading-tight">
                <span className="text-h4 font-bold font-display text-neutral-900 dark:text-dark-text truncate">
                  DooSplit
                </span>
                {firstName ? (
                  <span className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate">
                    Hi, {firstName}
                  </span>
                ) : null}
              </div>
            </Link>
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
                href="/expenses?focus=search"
                className={`p-2 rounded-lg transition-colors ${
                  pathname === "/expenses"
                    ? "text-primary bg-primary/10"
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                }`}
                aria-label="Search expenses"
              >
                <Search className="h-5 w-5" />
              </Link>
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
              <NotificationDropdown />
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

          {/* Right: search + controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Expanding search */}
            <form onSubmit={handleSearchSubmit}>
              <div
                className={`ds-search ${
                  theme === "light"
                    ? "border-neutral-200 bg-neutral-50 text-neutral-600"
                    : "border-dark-border bg-dark-bg text-dark-text-secondary"
                }`}
              >
                <Search className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search expenses…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-sans text-sm min-w-0 placeholder:text-neutral-400 dark:placeholder:text-dark-text-tertiary"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="flex-shrink-0 text-neutral-400 hover:text-neutral-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </form>

            {/* Vertical divider */}
            <div className={`ds-vdivider ${theme === "light" ? "bg-neutral-200" : "bg-dark-border"}`} />

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

            {/* User avatar — links to settings */}
            <Link href="/settings" title={displayName}>
              <div className="ds-topbar-avatar">
                {initials}
              </div>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* PWA Components */}
      <OfflineIndicator position="bottom" />
      <InstallPrompt variant="toast" position="bottom" />
    </div>
  );
};

export default AppShell;

