"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

/**
 * Dashboard navigation. Horizontally scrollable on mobile, keyboard
 * accessible (plain links), active route highlighted via `aria-current`.
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "نمای کلی" },
  { href: "/dashboard/prices", label: "قیمت‌ها" },
  { href: "/dashboard/flows", label: "جریان‌ها" },
  { href: "/dashboard/history", label: "تاریخچه" },
  { href: "/dashboard/correlation", label: "همبستگی" },
  { href: "/dashboard/health", label: "سلامت داده" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="ناوبری داشبورد" className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
