"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  Home,
  Users,
  UsersRound,
  Activity,
  Settings,
  PlusCircle,
  BarChart3,
  Wallet,
  UserPlus,
  Receipt,
  Moon,
  Sun,
} from "lucide-react";
import NotificationDropdown from "./NotificationDropdown";
import { useTheme } from "@/contexts/ThemeContext";

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Dashboard" },
    { href: "/expenses", icon: Receipt, label: "Expenses" },
    { href: "/friends", icon: Users, label: "Friends" },
    { href: "/groups", icon: UsersRound, label: "Groups" },
    { href: "/invite", icon: UserPlus, label: "Invite Friends" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/analytics", icon: BarChart3, label: "Analytics" },
    { href: "/settlements", icon: Wallet, label: "Settlements" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const isActive = (href: string) => pathname === href;

  // Don't render theme toggle during server-side rendering
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-white border-r border-neutral-200 z-30">
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-neutral-200">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <Image
              src="/logo.webp"
              alt="DooSplit"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-h4 font-bold text-neutral-900">
              DooSplit
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
              }`}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Add Expense Button */}
        <div className="p-4 border-t border-neutral-200">
          <Link href="/expenses/add">
            <button className="w-full flex items-center justify-center px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
              <PlusCircle className="h-5 w-5 mr-2" />
              Add Expense
            </button>
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-white dark:bg-dark-bg-secondary border-r border-neutral-200 dark:border-dark-border z-30">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-neutral-200 dark:border-dark-border">
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
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </button>
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
          href="/settings"
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
