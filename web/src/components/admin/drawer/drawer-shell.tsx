"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * DrawerShell — the right-side drawer chrome from the site-control-center
 * mockup (`docs/mockups/site-control-center.html`). Slides up on mobile,
 * in from the right on desktop.
 *
 * Chrome:
 *   header  → title icon (rounded square, gold-soft tint) + title + subtitle + X close
 *   body    → scrollable content (DrawerCallout, DrawerActionBar, DrawerItemRow…)
 *
 * Used by SiteShell / ProfileShell — every site/profile capability card opens
 * a drawer rather than navigating to a separate route.
 */

function useDashboardPortalThemeClass(open: boolean) {
  const read = React.useCallback((): "dashboard-theme-dark" | "dashboard-theme-light" => {
    if (typeof document === "undefined") return "dashboard-theme-dark";
    const raw = document
      .querySelector("[data-dashboard-theme]")
      ?.getAttribute("data-dashboard-theme");
    return raw === "light" ? "dashboard-theme-light" : "dashboard-theme-dark";
  }, []);

  const [themeClass, setThemeClass] = React.useState(read);

  React.useLayoutEffect(() => {
    if (!open) return;
    setThemeClass(read());
  }, [open, read]);

  return themeClass;
}

/**
 * Width tokens for the drawer. Tokens replace the legacy `wide` boolean;
 * `wide` is still accepted for back-compat and maps to "lg".
 *
 *   sm  → max-w-md   (default — single-form panel)
 *   md  → max-w-xl   (form + supporting list, denser)
 *   lg  → max-w-3xl  (two-column list/detail mode — formerly `wide`)
 *   xl  → max-w-5xl  (table-grade content; rare)
 */
export type DrawerSize = "sm" | "md" | "lg" | "xl";

const DRAWER_SIZE_CLASS: Record<DrawerSize, string> = {
  sm: "lg:w-full lg:max-w-md",
  md: "lg:w-full lg:max-w-xl",
  lg: "lg:w-full lg:max-w-3xl",
  xl: "lg:w-full lg:max-w-5xl",
};

export type DrawerShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Width token (sm/md/lg/xl). Defaults to "sm". */
  size?: DrawerSize;
  /** @deprecated Use `size="lg"`. Kept for back-compat. */
  wide?: boolean;
  /** Optional sticky header right-side actions (e.g. status badge). */
  headerRight?: React.ReactNode;
  /** Optional sticky footer (cancel/save bar). Rendered outside the scroll area. */
  footer?: React.ReactNode;
  /** Polite live-region message announced to screen readers on change. */
  announce?: string;
  children: React.ReactNode;
  className?: string;
};

export function DrawerShell({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  size,
  wide = false,
  headerRight,
  footer,
  announce,
  children,
  className,
}: DrawerShellProps) {
  const portalThemeClass = useDashboardPortalThemeClass(open);
  const resolvedSize: DrawerSize = size ?? (wide ? "lg" : "sm");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 min-h-[100dvh] min-h-[100svh] bg-black/30 backdrop-blur-[2px] dark:bg-black/55",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />

        <DialogPrimitive.Content
          className={cn(
            portalThemeClass,
            "fixed z-50 flex max-h-[min(96dvh,100dvh)] flex-col overflow-hidden shadow-2xl outline-none isolate lg:max-h-none",
            "border-border/60 bg-popover text-popover-foreground",
            "inset-x-0 bottom-0 rounded-t-2xl border-x border-t",
            "lg:inset-y-0 lg:right-0 lg:left-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l",
            DRAWER_SIZE_CLASS[resolvedSize],
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
            "lg:data-[state=open]:slide-in-from-right lg:data-[state=open]:slide-in-from-bottom-0",
            "lg:data-[state=closed]:slide-out-to-right lg:data-[state=closed]:slide-out-to-bottom-0",
            className,
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 px-5 pt-4 pb-3 lg:px-6 lg:pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)]"
              >
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {subtitle ? (
                  <DialogPrimitive.Description className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {subtitle}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">
                    {title}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerRight}
              <DialogPrimitive.Close
                aria-label="Close"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted/40 hover:text-foreground"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 lg:px-6",
              footer
                ? "pb-4 lg:pb-4"
                : "pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:pb-6",
            )}
          >
            {children}
            {announce ? (
              <span role="status" aria-live="polite" className="sr-only">
                {announce}
              </span>
            ) : null}
          </div>

          {footer ? (
            <div className="shrink-0 border-t border-border/40 bg-background/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm lg:px-6">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DrawerShellClose = DialogPrimitive.Close;
