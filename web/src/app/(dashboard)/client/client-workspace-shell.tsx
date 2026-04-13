"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, CalendarDays, Info, LayoutGrid, ShoppingBag } from "lucide-react";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { WorkspaceStickyShell } from "@/components/dashboard/workspace-sticky-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export function ClientWorkspaceShell({
  summary,
  children,
}: {
  summary: {
    displayLabel: string;
    savedCount: number;
    inquiryCount: number;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isOverview = pathname === "/client/overview";

  const statBadges = (
    <>
      <Badge variant="secondary" className="border-border/50 font-normal tabular-nums">
        {summary.savedCount} saved
      </Badge>
      <Badge variant="secondary" className="border-border/50 font-normal tabular-nums">
        {summary.inquiryCount} request{summary.inquiryCount === 1 ? "" : "s"}
      </Badge>
    </>
  );

  const aboutWorkspace = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" aria-hidden />
          About this workspace
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(320px,calc(100vw-2rem))] text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How your client area works</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>
            <strong className="font-medium text-foreground">Saved</strong> is your directory shortlist.
          </li>
          <li>
            <strong className="font-medium text-foreground">Requests</strong> track inquiries you send from the
            cart.
          </li>
          <li>
            <strong className="font-medium text-foreground">Bookings</strong> appear when the agency shares jobs
            with you.
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );

  /** Overview: cards already link to each area — keep only directory + cart CTAs here. */
  const overviewActions = (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" className={cn("min-h-9 gap-2", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
          <Link href="/directory" scroll={false}>
            <LayoutGrid className="size-4 opacity-80" aria-hidden />
            Browse directory
          </Link>
        </Button>
        <Button size="sm" className={cn("min-h-9 gap-2", LUXURY_GOLD_BUTTON_CLASS)} asChild>
          <Link href="/directory" scroll={false}>
            <ShoppingBag className="size-4 opacity-90" aria-hidden />
            Open cart
          </Link>
        </Button>
      </div>
      {aboutWorkspace}
    </div>
  );

  /** Subpages: full shortcuts for jumping between workspace areas. */
  const fullActions = (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" className="min-h-9 gap-2" asChild>
          <Link href="/client/saved" scroll={false} aria-label="Open saved talent">
            <Bookmark className="size-4 opacity-80" aria-hidden />
            Saved
            {summary.savedCount > 0 ? (
              <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums">
                {summary.savedCount > 99 ? "99+" : String(summary.savedCount)}
              </span>
            ) : null}
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="min-h-9 gap-2" asChild>
          <Link href="/client/bookings" scroll={false}>
            <CalendarDays className="size-4 opacity-80" aria-hidden />
            Bookings
          </Link>
        </Button>
        <Button variant="outline" size="sm" className={cn("min-h-9 gap-2", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
          <Link href="/directory" scroll={false}>
            <LayoutGrid className="size-4 opacity-80" aria-hidden />
            Directory
          </Link>
        </Button>
        <Button size="sm" className={cn("min-h-9 gap-2", LUXURY_GOLD_BUTTON_CLASS)} asChild>
          <Link href="/directory" scroll={false}>
            <ShoppingBag className="size-4 opacity-90" aria-hidden />
            Cart
          </Link>
        </Button>
      </div>
      {aboutWorkspace}
    </div>
  );

  return (
    <div className="space-y-6">
      <WorkspaceStickyShell>
        <div className="rounded-2xl border border-border/60 bg-card/50 px-4 py-4 shadow-sm ring-1 ring-black/[0.03] sm:px-5 dark:ring-white/[0.04]">
          <DashboardPageHeader
            title="Workspace"
            description={
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                {!isOverview ? (
                  <span className="text-sm font-medium text-foreground">{summary.displayLabel}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Shortlist talent, send requests, and track bookings in one place.
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-2">{statBadges}</div>
              </div>
            }
            right={isOverview ? overviewActions : fullActions}
          />
        </div>
      </WorkspaceStickyShell>

      <div className="min-h-[12rem]">{children}</div>
    </div>
  );
}
