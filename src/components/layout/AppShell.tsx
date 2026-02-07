"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NotificationDropdown from "./NotificationDropdown";

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-bg">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="md:pl-64">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 h-14 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
          <div className="flex items-center justify-between h-full px-4">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <Image
                src="/logo.webp"
                alt="DooSplit"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg"
              />
              <span className="text-h4 font-bold text-neutral-900 dark:text-dark-text">
                DooSplit
              </span>
            </Link>
            <div className="flex items-center space-x-1">
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

        {/* Page Content */}
        <main className="pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
};

export default AppShell;
