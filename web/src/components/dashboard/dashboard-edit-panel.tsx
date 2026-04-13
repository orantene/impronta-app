"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dialog portals render on `body`, so tokens must be re-scoped to match the dashboard shell. */
function useDashboardPortalThemeClass(open: boolean) {
  const read = React.useCallback((): "dashboard-theme-dark" | "dashboard-theme-light" => {
    if (typeof document === "undefined") return "dashboard-theme-dark";
    const raw = document.querySelector("[data-dashboard-theme]")?.getAttribute("data-dashboard-theme");
    return raw === "light" ? "dashboard-theme-light" : "dashboard-theme-dark";
  }, []);

  const [themeClass, setThemeClass] = React.useState(read);

  React.useLayoutEffect(() => {
    if (!open) return;
    setThemeClass(read());
  }, [open, read]);

  return themeClass;
}

export type DashboardEditPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional React node rendered inline after the title (e.g. info tooltip). */
  titleExtra?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  /**
   * Hides the top title/description/Done row. Title/description stay available to screen readers.
   * Use with `bottomBar` for Done + actions pinned to the bottom of the sheet.
   */
  minimalHeader?: boolean;
  /** Pinned below the scroll area (not inside it). Safe-area padding applied here. */
  bottomBar?: React.ReactNode;
  className?: string;
};

/**
 * Shared dashboard edit panel (sheet): slides up on mobile, in from the right on desktop.
 * Mirrors the polished Talent panel chrome without Talent-specific semantics.
 */
export function DashboardEditPanel({
  open,
  onOpenChange,
  title,
  titleExtra,
  description,
  children,
  minimalHeader = false,
  bottomBar,
  className,
}: DashboardEditPanelProps) {
  /** Bottom bar can be passed alone; we hide the top header in that case so Done stays in one place. */
  const effectiveMinimalHeader = minimalHeader || bottomBar != null;
  const hasBottomChrome = effectiveMinimalHeader;
  const portalThemeClass = useDashboardPortalThemeClass(open);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 min-h-[100dvh] min-h-[100svh] bg-black/35 backdrop-blur-[2px] dark:bg-black/55",
            "supports-[backdrop-filter]:bg-black/25 supports-[backdrop-filter]:dark:bg-black/45",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "motion-reduce:data-[state=open]:duration-150 motion-reduce:data-[state=closed]:duration-100",
          )}
        />

        <DialogPrimitive.Content
          className={cn(
            portalThemeClass,
            "fixed z-50 flex max-h-[min(96dvh,100dvh)] flex-col overflow-hidden shadow-2xl outline-none isolate lg:max-h-none",
            "border-border/60 bg-popover text-popover-foreground ring-1 ring-[var(--impronta-gold-border)]",
            "inset-x-0 bottom-0 rounded-none border-x border-t",
            "lg:inset-y-0 lg:right-0 lg:left-auto lg:w-full lg:max-w-xl lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200",
            "lg:data-[state=open]:slide-in-from-right lg:data-[state=open]:slide-in-from-bottom-0",
            "lg:data-[state=closed]:slide-out-to-right lg:data-[state=closed]:slide-out-to-bottom-0",
            "motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0",
            "motion-reduce:lg:data-[state=open]:slide-in-from-right-0 motion-reduce:lg:data-[state=closed]:slide-out-to-right-0",
            "motion-reduce:data-[state=open]:duration-150 motion-reduce:data-[state=closed]:duration-100",
            className,
          )}
        >
          {!effectiveMinimalHeader ? (
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 bg-[rgba(225,223,219,1)] px-5 pt-3 pb-4 backdrop-blur-md dark:bg-zinc-900/70 lg:px-6 lg:pt-5">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="inline-flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground">
                  {title}
                  {titleExtra ?? null}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close className="flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-border/60 bg-background/80 px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/35 hover:bg-muted/40">
                <X className="size-4 opacity-70" />
                Done
              </DialogPrimitive.Close>
            </div>
          ) : (
            <>
              <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
              ) : null}
            </>
          )}

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 lg:px-6",
              hasBottomChrome
                ? "pb-4 lg:pb-5"
                : "pb-[max(7rem,env(safe-area-inset-bottom,0px)+5rem)] lg:pb-28",
              "bg-transparent dark:bg-transparent",
            )}
          >
            {children}
          </div>

          {hasBottomChrome ? (
            <div
              className={cn(
                "shrink-0 border-t border-border/50 bg-background/80 px-5 pt-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 dark:bg-zinc-950/70",
                "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] lg:px-6",
              )}
            >
              {bottomBar ?? (
                <DialogPrimitive.Close className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background/90 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/35 hover:bg-muted/40">
                  <X className="size-4 opacity-70" />
                  Done
                </DialogPrimitive.Close>
              )}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DashboardEditPanelClose = DialogPrimitive.Close;

