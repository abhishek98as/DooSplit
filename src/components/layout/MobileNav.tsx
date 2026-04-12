"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/ui/BrandLogo";
import {
  Home,
  Users,
  Activity,
  Plus,
  Receipt,
} from "lucide-react";

const MobileNav: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", icon: Home, label: "Home" },
    { href: "/friends", icon: Users, label: "Friends" },
    { href: "/expenses", icon: Receipt, label: "Expenses" },
    { href: "/activity", icon: Activity, label: "Activity" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

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
                  : "text-neutral-500 hover:text-neutral-700 dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary"
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

        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors ${
                isActive(item.href)
                  ? "text-primary"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-dark-text-tertiary dark:hover:text-dark-text-secondary"
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
