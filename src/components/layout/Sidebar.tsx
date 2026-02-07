"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  UsersRound,
  Activity,
  Settings,
  PlusCircle,
  BarChart3,
  Wallet,
} from "lucide-react";
import NotificationDropdown from "./NotificationDropdown";

const Sidebar: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Dashboard" },
    { href: "/friends", icon: Users, label: "Friends" },
    { href: "/groups", icon: UsersRound, label: "Groups" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/analytics", icon: BarChart3, label: "Analytics" },
    { href: "/settlements", icon: Wallet, label: "Settlements" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-white dark:bg-dark-bg-secondary border-r border-neutral-200 dark:border-dark-border z-30">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-neutral-200 dark:border-dark-border">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <Wallet className="h-5 w-5 text-white" />
          </div>
          <span className="text-h4 font-bold text-neutral-900 dark:text-dark-text">
            DooSplit
          </span>
        </Link>
        <NotificationDropdown />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <Link
          href="/expenses/add"
          className="flex items-center w-full h-11 px-4 mb-4 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
        >
          <PlusCircle className="h-5 w-5 mr-3" />
          <span className="font-medium">Add Expense</span>
        </Link>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center w-full h-11 px-4 rounded-md transition-colors ${
                isActive(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-neutral-700 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
              }`}
            >
              <Icon className="h-5 w-5 mr-3" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-neutral-200 dark:border-dark-border">
        <Link
          href="/settings/profile"
          className="flex items-center space-x-3 p-3 rounded-md hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
        >
          <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-semibold">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-dark-text truncate">
              User Name
            </p>
            <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate">
              View Profile
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
};

export default Sidebar;
