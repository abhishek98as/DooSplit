"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  Receipt,
  UsersRound,
  Menu,
} from "lucide-react";

const TABS = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/expenses", icon: Receipt, label: "Expenses" },
  { href: "/friends", icon: Users, label: "Friends" },
  { href: "/groups", icon: UsersRound, label: "Groups" },
] as const;

const OPEN_MENU_EVENT = "doosplit:open-mobile-menu";

const MobileNav: React.FC = () => {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const openMore = () => {
    window.dispatchEvent(new CustomEvent(OPEN_MENU_EVENT));
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-bg-secondary border-t border-neutral-200 dark:border-dark-border shadow-lg z-40 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 px-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors px-1 min-w-0 touch-target ${
                active
                  ? "text-primary font-semibold"
                  : "text-neutral-500 dark:text-dark-text-tertiary hover:text-neutral-700 dark:hover:text-dark-text"
              }`}
            >
              <Icon className="h-6 w-6 shrink-0" />
              <span className="text-xs font-medium leading-none truncate max-w-full">
                {item.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={openMore}
          className="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors px-1 min-w-0 touch-target text-neutral-500 dark:text-dark-text-tertiary hover:text-neutral-700 dark:hover:text-dark-text"
          aria-label="More menu"
        >
          <Menu className="h-6 w-6 shrink-0" />
          <span className="text-xs font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileNav;
export { OPEN_MENU_EVENT };
