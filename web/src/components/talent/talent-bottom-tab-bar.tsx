"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LayoutDashboard, Camera, Send, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/talent/my-profile", label: "Home", icon: LayoutDashboard },
  { href: "/talent/portfolio", label: "Media", icon: Camera },
  { href: "/talent/status", label: "Status", icon: Send },
  { href: "/talent/account", label: "Account", icon: User },
] as const;

export function TalentBottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  /** Warm route JS so tab switches feel instant on slow networks. */
  useEffect(() => {
    TABS.forEach((tab) => {
      router.prefetch(tab.href);
    });
  }, [router]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <nav
        className="pointer-events-auto mx-auto mb-2 max-w-md rounded-full border border-border/50 bg-white/95 px-1 py-1.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur-xl dark:border-border/60 dark:bg-[#1a1a1a]/95 dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.55)]"
        aria-label="Talent navigation"
      >
        <div className="flex items-center justify-around px-0.5">
          {TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-semibold tracking-tight transition-all duration-200",
                  active
                    ? "bg-[var(--impronta-gold)]/14 text-[var(--impronta-gold)] shadow-sm dark:bg-[var(--impronta-gold)]/18"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-[22px] transition-transform duration-200",
                    active && "scale-105 text-[var(--impronta-gold)]",
                  )}
                  strokeWidth={active ? 2.25 : 1.8}
                />
                <span className="max-w-[4.5rem] truncate">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
