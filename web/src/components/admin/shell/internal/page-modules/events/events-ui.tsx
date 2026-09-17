"use client";

/**
 * events-ui.tsx — the pieces the Events boards (W16, EventDetail, W17, W18,
 * CreateEvent) are drawn with on top of the Catalog kit: the 26px page
 * title on a 13px line, the board's block pill for a list cell (17px, fills
 * its column, label left), the 33px list head and 40px row at 1.2
 * line-height, the kit's chevron over an `appearance-none` select, and the
 * 24px KPI figure. Token classes only; inline styles are frozen under this
 * tree.
 *
 * Kept beside `catalog-ui` rather than inside it: the Catalog's own second
 * pass (polish5) lands the same pieces there, and two open branches editing
 * one file is a merge conflict for nothing. Fold these into the kit once
 * both are on main.
 */

import type { ReactNode } from "react";

import { Icon } from "../../primitives";
import { INPUT } from "../catalog/catalog-ui";

/** A select under the kit's chevron: `appearance-none`, room for the glyph, inside `SelectShell`. */
export const SELECT = `${INPUT} appearance-none pr-[30px]`;

/** The board's page title: 26px on a 13px line, actions on the right. */
export function EventsHeading({ title, intro, actions, testId }: { title: string; intro: string; actions?: ReactNode; testId?: string }) {
  return (
    <header className="flex items-center justify-between gap-[12px] max-[720px]:flex-wrap" data-testid={testId}>
      <div className="min-w-0">
        <h1 className="m-0 font-admin-body text-[26px]! font-semibold leading-[1.2] tracking-[-0.02em] text-admin-ink max-[720px]:text-[22px]!">{title}</h1>
        <p className="m-0 mt-[3px] font-admin-body text-admin-13 leading-[1.2] text-admin-ink-muted max-[720px]:hidden">{intro}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-[8px] max-[720px]:w-full max-[720px]:flex-wrap">{actions}</div> : null}
    </header>
  );
}

export type BlockTone = "green" | "coral" | "slate" | "indigo" | "critical";
const BLOCK_TONE: Record<BlockTone, string> = {
  green: "bg-admin-success-soft text-admin-success-deep",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-surface-alt text-admin-ink",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  critical: "bg-admin-critical-soft text-admin-red",
};

/** The board's list-cell pill: a tinted block that fills its column, 17px tall, the label on the left. */
export function BlockPill({ tone, children, testId, state, className = "" }: { tone: BlockTone; children: ReactNode; testId?: string; state?: string; className?: string }) {
  return (
    <span
      data-testid={testId}
      data-state={state}
      className={`flex h-[17px] w-full min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[5px] px-[8px] font-admin-body text-[11.5px] font-semibold leading-none ${BLOCK_TONE[tone]} ${className}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** The uppercase head of a list card at the board's 33px. `cols` is a `grid-cols-[...]` class. */
export function DenseHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className={`grid items-center gap-[12px] px-[18px] py-[10px] font-admin-body text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted max-[720px]:hidden ${cols}`}>
      {children}
    </div>
  );
}

/** A list row at the board's 40px: 13px at 1.2 on an 11px inset. */
export function DenseRow({ cols, children, testId, className = "" }: { cols: string; children: ReactNode; testId?: string; className?: string }) {
  return (
    <div
      data-testid={testId}
      className={`grid items-center gap-[12px] border-t border-admin-border-soft px-[18px] py-[11px] font-admin-body text-[13px] leading-[1.2] text-admin-ink ${cols} ${className}`}
    >
      {children}
    </div>
  );
}

/** The chevron over an `appearance-none` select (the boards' own arrow, not the browser's). */
export function SelectShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative block min-w-0 ${className}`}>
      {children}
      <span aria-hidden className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
        <Icon name="chevron-down" size={13} stroke={1.75} />
      </span>
    </span>
  );
}

/** The kebab at the end of a row, 16px so it never sets the row's height. */
export function RowMenu({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className="inline-flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded-[4px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
    >
      <Icon name="ellipsis" size={14} stroke={1.75} />
    </button>
  );
}

/** The board's KPI tile: uppercase label, 24px figure, one muted line. */
export function Stat({ label, value, note, testId }: { label: string; value: string | null; note: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-[6px] rounded-[14px] border border-admin-border bg-admin-card px-[16px] py-[14px]" data-testid={testId}>
      <div className="font-admin-body text-[11px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-admin-ink-muted">{label}</div>
      <div className="font-admin-body text-[24px] font-semibold leading-none tabular-nums text-admin-ink">{value ?? "—"}</div>
      <div className="font-admin-body text-[11.5px] leading-[1.2] text-admin-ink-muted">{note}</div>
    </div>
  );
}

/** The board's note under a table: indigo with the triangle, or coral. */
export function EventsNote({ children, tone = "indigo" }: { children: ReactNode; tone?: "indigo" | "warn" }) {
  return (
    <div
      className={`flex items-start gap-[8px] rounded-[10px] px-[12px] py-[10px] font-admin-body text-[12.5px] leading-[1.4] ${
        tone === "warn" ? "bg-admin-coral-soft text-admin-coral-deep" : "bg-admin-indigo-soft text-admin-indigo"
      }`}
    >
      <Icon name="alert" size={14} stroke={1.75} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
