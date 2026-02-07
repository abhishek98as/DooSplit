"use client";

import React from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import NotificationDropdown from "./NotificationDropdown";

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-bg">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="md:pl-64">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 h-14 bg-white dark:bg-dark-bg-secondary border-b border-neutral-200 dark:border-dark-border">
          <div className="flex items-center justify-between h-full px-4">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="text-h4 font-bold text-neutral-900 dark:text-dark-text">
                DooSplit
              </span>
            </div>
            <NotificationDropdown />
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
