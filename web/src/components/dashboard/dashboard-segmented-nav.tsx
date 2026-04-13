"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type DashboardSegmentedNavLink = { href: string; label: string };
export type DashboardSegmentedNavItem = DashboardSegmentedNavLink & { active: boolean };

export function DashboardSegmentedNav({
  ariaLabel,
  items,
  className,
}: {
  ariaLabel: string;
  items: DashboardSegmentedNavItem[];
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("-mx-2 overflow-x-auto px-2", className)}>
      <div className="inline-flex w-max items-center gap-1 rounded-full border border-border/50 bg-card/45 p-1 shadow-sm backdrop-blur-sm">
        {items.map((item) => {
          const active = item.active;
          return (
            <Link
              key={item.href}
              href={item.href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 select-none items-center justify-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-[color,background-color,box-shadow,border-color] duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "bg-[var(--impronta-gold)]/12 text-foreground shadow-sm ring-1 ring-[var(--impronta-gold)]/28"
                  : "text-muted-foreground hover:bg-muted/45 hover:text-foreground",
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

