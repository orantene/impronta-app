"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * DrawerItemRow — match the mockup's `.item-row` primitive. Header row
 * (title + slug + status + actions) with collapsible quick-edit body.
 *
 * Used inside drawers as the dense list-row primitive: pages/posts/fields/
 * terms/widgets all use this same shape.
 */

export type DrawerItemRowStatus = "live" | "draft" | "hidden" | "neutral";

const STATUS_TONE: Record<
  DrawerItemRowStatus,
  { bg: string; fg: string; label: string }
> = {
  live: { bg: "rgba(20,107,58,0.10)", fg: "#146b3a", label: "Live" },
  draft: { bg: "rgba(139,109,31,0.10)", fg: "#8b6d1f", label: "Draft" },
  hidden: { bg: "rgba(0,0,0,0.05)", fg: "var(--muted-foreground)", label: "Hidden" },
  neutral: { bg: "rgba(0,0,0,0.05)", fg: "var(--muted-foreground)", label: "" },
};

export type DrawerItemRowProps = {
  title: string;
  slug?: string;
  /** Pre-set status pill. Use `customStatus` to override label/colour. */
  status?: DrawerItemRowStatus;
  customStatus?: { label: string; tone?: "neutral" | "required" | "recommended" };
  /** Right-aligned non-toggle action buttons (canvas, more, etc). */
  actions?: React.ReactNode;
  /** Quick-edit body content. When provided, the row gets a chevron toggle. */
  quickEdit?: React.ReactNode;
  defaultOpen?: boolean;
};

export function DrawerItemRow({
  title,
  slug,
  status,
  customStatus,
  actions,
  quickEdit,
  defaultOpen = false,
}: DrawerItemRowProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasQuickEdit = quickEdit != null;

  const statusTone =
    customStatus?.tone === "required"
      ? { bg: "rgba(156,58,58,0.10)", fg: "#9c3a3a" }
      : customStatus?.tone === "recommended"
        ? { bg: "rgba(139,109,31,0.10)", fg: "#8b6d1f" }
        : status
          ? STATUS_TONE[status]
          : null;
  const statusLabel = customStatus?.label ?? (status ? STATUS_TONE[status].label : "");

  return (
    <div
      className={cn(
        "group/row rounded-xl border border-border/50 bg-card/40 transition-colors",
        open ? "border-border" : "hover:border-border/80",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => hasQuickEdit && setOpen((v) => !v)}
          aria-expanded={hasQuickEdit ? open : undefined}
          aria-label={hasQuickEdit ? (open ? "Collapse" : "Expand") : undefined}
          disabled={!hasQuickEdit}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left",
            hasQuickEdit ? "cursor-pointer" : "cursor-default",
          )}
        >
          {hasQuickEdit ? (
            open ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )
          ) : (
            <span aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="truncate text-[13px] font-medium text-foreground">
            {title}
          </span>
          {slug ? (
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
              {slug}
            </span>
          ) : null}
        </button>
        {statusTone && statusLabel ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}
          >
            {statusLabel}
          </span>
        ) : null}
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      {hasQuickEdit && open ? (
        <div className="border-t border-border/40 px-3 py-3">{quickEdit}</div>
      ) : null}
    </div>
  );
}

/** Small icon-only row action button. */
export function DrawerRowAction({
  onClick,
  label,
  children,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Quick-edit field shell — uppercase tiny label + form control. */
export function DrawerQField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export const DRAWER_INPUT_CLASS =
  "h-8 w-full rounded-lg border border-border/60 bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:border-[var(--impronta-gold)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--impronta-gold)]/15";

export const DRAWER_TEXTAREA_CLASS =
  "min-h-[64px] w-full resize-y rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:border-[var(--impronta-gold)]/45 focus:outline-none focus:ring-2 focus:ring-[var(--impronta-gold)]/15";

export function DrawerQToggle({
  label,
  defaultChecked,
}: {
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-3.5 rounded border-border/70 accent-foreground"
      />
      {label}
    </label>
  );
}

export function DrawerQActions({
  destructive,
  children,
}: {
  destructive?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
      <div>{destructive ?? null}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
