"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/admin/shell/internal/primitives";
import type { PromoStatus } from "@/lib/promos/types";
import type { PromoCopy } from "@/lib/promos/copy/talent";

/** Theme tokens with fallbacks, because sheets render in a portal outside the talent shell wrapper. */
export const UI = {
  card: "rounded-2xl border border-[var(--tc-border,#e5e5ea)] bg-white",
  ink: "text-[var(--tc-ink,#1c1c1e)]",
  muted: "text-[var(--tc-muted,#6b6b73)]",
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--tc-action,#0f766e)] px-5 text-[14px] font-semibold text-white disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--tc-border,#e5e5ea)] bg-white px-4 text-[14px] font-medium text-[var(--tc-ink,#1c1c1e)] disabled:opacity-50",
  quiet:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[14px] font-medium text-[var(--tc-muted,#6b6b73)]",
} as const;

export function TagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

/** (i) tooltip: a tap target that reveals one short line, never a wall of text. */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={text}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${UI.muted}`}
      >
        <Icon name="info" size={15} stroke={1.7} />
      </button>
      {open ? (
        <span role="status" className="absolute right-0 top-11 z-10 w-[240px] rounded-xl border border-[var(--tc-border,#e5e5ea)] bg-white p-3 text-[12px] leading-snug text-[var(--tc-ink,#1c1c1e)] shadow-lg">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 text-[14px] font-medium ${
        active
          ? "border-[var(--tc-action,#0f766e)] bg-[var(--tc-soft,#e6f4f1)] text-[var(--tc-ink,#1c1c1e)]"
          : "border-[var(--tc-border,#e5e5ea)] bg-white text-[var(--tc-muted,#6b6b73)]"
      }`}
    >
      {children}
    </button>
  );
}

const STATUS_DOT: Record<PromoStatus, string> = {
  live: "bg-emerald-500",
  scheduled: "bg-sky-500",
  paused: "bg-amber-500",
  sold_out: "bg-violet-500",
  draft: "bg-neutral-400",
  expired: "bg-neutral-300",
  archived: "bg-neutral-300",
};

export function StatusBadge({ status, copy }: { status: PromoStatus; copy: PromoCopy }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--tc-muted,#6b6b73)]">
      <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
      {copy.t(`status.${status}` as const)}
    </span>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--tc-soft,#eef0f2)]">
      <div className="h-full rounded-full bg-[var(--tc-action,#0f766e)]" style={{ width: `${pct}%` }} />
    </div>
  );
}
