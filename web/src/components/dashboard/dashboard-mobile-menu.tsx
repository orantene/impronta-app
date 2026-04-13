"use client";

import Link from "next/link";
import { Suspense } from "react";
import { Home, Menu, PanelLeft } from "lucide-react";
import { DashboardSidebarNavLinks } from "@/components/dashboard/dashboard-nav-links";
import { Button } from "@/components/ui/button";
import type { DashboardNavGroup } from "@/lib/dashboard/architecture";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function DashboardMobileMenu({
  roleLabel,
  profileName,
  email,
  menuCopy,
  groups,
  signOutForm,
  workspaceSwitcher,
}: {
  roleLabel: string;
  profileName: string;
  email: string;
  menuCopy: {
    sheetDashboardTitle: string;
    menuButton: string;
    loadingNav: string;
    exitToSite: string;
  };
  groups: DashboardNavGroup[];
  signOutForm: React.ReactNode;
  workspaceSwitcher?: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-10 gap-2 rounded-xl border-[var(--impronta-gold-border)]/60 bg-card/50 px-3 font-medium",
            "shadow-sm transition-colors hover:border-[var(--impronta-gold)]/40 hover:bg-[var(--impronta-gold)]/5",
          )}
        >
          <Menu className="size-4 shrink-0 text-[var(--impronta-gold)]" aria-hidden />
          <span className="text-foreground">{menuCopy.menuButton}</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex h-full max-h-[100dvh] w-[min(100vw-2rem,22rem)] flex-col border-[var(--impronta-gold-border)]/50 bg-[var(--impronta-surface)] p-0 lg:hidden"
      >
        <SheetHeader className="space-y-3 border-b border-[var(--impronta-gold-border)]/40 px-5 pb-4 pt-6">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)]">
              <PanelLeft className="size-4" aria-hidden />
            </span>
            <div>
              <p className="font-display text-xs font-semibold tracking-[0.2em] text-[var(--impronta-gold)] uppercase">
                Impronta
              </p>
              <SheetTitle className="text-left text-base font-semibold text-foreground">
                {menuCopy.sheetDashboardTitle}
              </SheetTitle>
            </div>
          </div>
          <SheetDescription className="text-left text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{roleLabel}</span>
            <span className="text-muted-foreground/80"> · </span>
            {profileName}
          </SheetDescription>
          <p className="text-xs leading-relaxed text-muted-foreground">{email}</p>
          {workspaceSwitcher ? (
            <div className="border-t border-[var(--impronta-gold-border)]/30 pt-3">
              {workspaceSwitcher}
            </div>
          ) : null}
        </SheetHeader>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <Suspense
            fallback={
              <p className="px-2 text-sm text-muted-foreground">{menuCopy.loadingNav}</p>
            }
          >
            <DashboardSidebarNavLinks groups={groups} forceExpanded />
          </Suspense>
        </nav>

        <div className="space-y-2.5 border-t border-[var(--impronta-gold-border)]/40 px-4 py-4">
          {signOutForm}
          <Button
            variant="ghost"
            className="h-11 w-full justify-start gap-2 rounded-2xl px-3 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/">
              <Home className="size-4 shrink-0" aria-hidden />
              {menuCopy.exitToSite}
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
