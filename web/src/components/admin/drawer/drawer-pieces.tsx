"use client";

import * as React from "react";
import { Info, Lock, Search } from "lucide-react";

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
