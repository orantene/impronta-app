"use client";

import * as React from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Lock,
  RefreshCw,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Reusable drawer body pieces — match the mockup's `.drawer-callout`,
 * `.drawer-action-bar`, `.drawer-lock-note` chrome.
 */

export function DrawerCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DrawerLockNote({
  tier = "Agency",
  children,
}: {
  tier?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-border/60 bg-[var(--impronta-gold)]/[0.06] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
      <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--impronta-gold)]" />
      <div className="min-w-0">
        {children ?? (
          <>
            New schema unlocks on <strong>{tier}</strong>. You can still rename,
            reorder, and change visibility on any plan.
          </>
        )}
      </div>
    </div>
  );
}

export function DrawerActionBar({
  primary,
  searchPlaceholder,
  searchValue,
  onSearchChange,
}: {
  primary?: React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {primary ? <div className="shrink-0">{primary}</div> : null}
      {searchPlaceholder !== undefined ? (
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-full border border-border/60 bg-background/70 pl-8 pr-3 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:border-[var(--impronta-gold)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--impronta-gold)]/15"
          />
        </label>
      ) : null}
    </div>
  );
}

export function DrawerPrimaryButton({
  onClick,
  children,
  type = "button",
}: {
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background transition-opacity hover:opacity-90"
    >
      {children}
    </button>
  );
}

export function DrawerGhostButton({
  onClick,
  children,
  type = "button",
}: {
  onClick?: () => void;
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 text-[12.5px] font-medium text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40"
    >
      {children}
    </button>
  );
}

export function DrawerLockedButton({
  onClick,
  tier = "Agency",
  children,
}: {
  onClick?: () => void;
  tier?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-[var(--impronta-gold)]/[0.06] px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-[var(--impronta-gold)]/[0.12]"
    >
      <Lock aria-hidden className="size-3 text-[var(--impronta-gold)]" />
      {children}
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        · {tier}
      </span>
    </button>
  );
}

export function DrawerSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5 first:mt-0", className)}>
      {title ? (
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
      ) : null}
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function DrawerEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * DrawerFooterBar — sticky cancel/save bar for drawer flows. Pass to
 * `<DrawerShell footer={...}>` so it stays pinned outside the scrollable body.
 *
 *   <DrawerShell footer={<DrawerFooterBar onCancel={...} onSave={...} />}>
 */
export function DrawerFooterBar({
  onCancel,
  onSave,
  cancelLabel = "Cancel",
  saveLabel = "Save",
  saving = false,
  disabled = false,
  destructive = false,
  hint,
  saveType = "button",
}: {
  onCancel?: () => void;
  onSave?: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  saving?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  hint?: React.ReactNode;
  saveType?: "button" | "submit";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
        {hint}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onCancel ? (
          <DrawerGhostButton onClick={onCancel}>{cancelLabel}</DrawerGhostButton>
        ) : null}
        <button
          type={saveType}
          onClick={onSave}
          disabled={disabled || saving}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-opacity",
            destructive
              ? "bg-red-600 text-white hover:opacity-90"
              : "bg-foreground text-background hover:opacity-90",
            (disabled || saving) && "opacity-50 cursor-not-allowed",
          )}
        >
          {saving ? <RefreshCw className="size-3.5 animate-spin" aria-hidden /> : null}
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * DrawerSkeleton — placeholder rows while drawer body is loading. Renders
 * shimmer pills approximating the final content density.
 */
export function DrawerSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-3"
        >
          <div className="size-8 shrink-0 animate-pulse rounded-lg bg-foreground/10" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-foreground/15" />
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * DrawerError — error state with optional retry CTA. Use when a drawer body
 * fetch fails or a server action returns an exception.
 */
export function DrawerError({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/[0.04] px-4 py-4">
      <div className="flex items-start gap-2.5">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-red-500" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/40"
        >
          <RefreshCw className="size-3" aria-hidden />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * DrawerBreadcrumb — for nested drawer flows where the user drills in. Pass
 * trail of {label, onClick} entries; the final label renders as plain text.
 *
 *   <DrawerBreadcrumb trail={[
 *     { label: "Plan", onClick: () => setStep("plan") },
 *     { label: "Cancel" },
 *   ]} />
 */
export function DrawerBreadcrumb({
  trail,
  className,
}: {
  trail: Array<{ label: string; onClick?: () => void }>;
  className?: string;
}) {
  if (!trail.length) return null;
  return (
    <nav
      aria-label="Drawer breadcrumb"
      className={cn(
        "mb-3 flex items-center gap-1 text-[11.5px] text-muted-foreground",
        className,
      )}
    >
      {trail.map((entry, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={`${entry.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? (
              <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden />
            ) : null}
            {entry.onClick && !isLast ? (
              <button
                type="button"
                onClick={entry.onClick}
                className="rounded px-1 py-0.5 transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                {entry.label}
              </button>
            ) : (
              <span
                className={cn(
                  "px-1 py-0.5",
                  isLast && "font-semibold text-foreground",
                )}
              >
                {entry.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * DrawerBackButton — small "← back" link for nested drawer steps. Pair with
 * DrawerBreadcrumb when stack depth > 2.
 */
export function DrawerBackButton({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

/**
 * DrawerConfirmBody — confirmation pattern body. Pair with DrawerShell + a
 * DrawerFooterBar in the footer slot. Stop hand-rolling alert dialogs.
 *
 *   <DrawerShell
 *     open={...}
 *     onOpenChange={...}
 *     title="Delete this booking?"
 *     icon={Trash2}
 *     footer={<DrawerFooterBar onCancel={...} onSave={...} saveLabel="Delete" destructive />}
 *   >
 *     <DrawerConfirmBody description="This is permanent." consequences={[
 *       "Talent will see the cancellation",
 *       "Linked invoices will be voided",
 *     ]} />
 *   </DrawerShell>
 */
export function DrawerConfirmBody({
  description,
  consequences,
  tone = "danger",
}: {
  description?: React.ReactNode;
  consequences?: React.ReactNode[];
  tone?: "danger" | "warning" | "info";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/30 bg-red-500/[0.04]"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/[0.04]"
        : "border-border/60 bg-muted/20";
  return (
    <div className={cn("rounded-xl border px-4 py-4", toneClass)}>
      {description ? (
        <p className="text-[13px] leading-relaxed text-foreground">{description}</p>
      ) : null}
      {consequences && consequences.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px] text-muted-foreground">
          {consequences.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
