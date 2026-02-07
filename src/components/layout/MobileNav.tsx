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
} from "lucide-react";

const MobileNav: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Home" },
    { href: "/friends", icon: Users, label: "Friends" },
    { href: "/groups", icon: UsersRound, label: "Groups" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border shadow-lg z-40 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors ${
                isActive(item.href)
                  ? "text-primary"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* FAB - Add Expense */}
        <Link
          href="/expenses/add"
          className="flex items-center justify-center -mt-8 h-14 w-14 bg-primary text-white rounded-full shadow-lg hover:bg-primary-dark transition-all"
        >
          <PlusCircle className="h-7 w-7" />
        </Link>

        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors ${
                isActive(item.href)
                  ? "text-primary"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNav;
