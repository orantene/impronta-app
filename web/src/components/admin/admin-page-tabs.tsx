"use client";

import Link from "next/link";
import {
  ADMIN_TAB_BAR,
  ADMIN_TAB_BAR_SCROLL,
  ADMIN_TAB_ITEM,
  ADMIN_TAB_ITEM_ACTIVE,
  ADMIN_TAB_ITEM_IDLE,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export type AdminPageTabItem = { href: string; label: string; active: boolean };

/**
 * Unified horizontal tab bar for admin sub-navigation. URL-driven links with a gold
 * underline on the active tab; scrolls horizontally on narrow viewports.
 */
export function AdminPageTabs({
  ariaLabel,
  items,
  className,
}: {
  ariaLabel: string;
  items: AdminPageTabItem[];
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn(ADMIN_TAB_BAR, className)}>
      <div className={ADMIN_TAB_BAR_SCROLL}>
        {items.map((item) => {
          const active = item.active;
          return (
            <Link
              key={item.href}
              href={item.href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                ADMIN_TAB_ITEM,
                active ? ADMIN_TAB_ITEM_ACTIVE : ADMIN_TAB_ITEM_IDLE,
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
