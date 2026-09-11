"use client";

/**
 * classes-ui.tsx — the pieces the Front desk boards (B01 to B06) are drawn
 * with, at tablet size: the two-pane list + detail, the chips, the pills,
 * the action buttons, the sheet that slides over the list. Token classes
 * only; a control the engine has no action for is disabled WITH its reason
 * as the title (never a dead button).
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const POS_BTN =
  "inline-flex h-[44px] items-center justify-center gap-[8px] whitespace-nowrap rounded-[12px] border px-[16px] font-admin-body text-[15px] font-semibold [transition:background_var(--transition-admin-micro),border-color_var(--transition-admin-micro)]";
export const POS_BTN_PRIMARY = `${POS_BTN} cursor-pointer border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`;
export const POS_BTN_SECONDARY = `${POS_BTN} cursor-pointer border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`;
export const POS_BTN_OUTLINE = `${POS_BTN} cursor-pointer border-admin-brand bg-admin-card text-admin-brand hover:bg-admin-brand-soft`;
export const POS_BTN_OFF = `${POS_BTN} cursor-not-allowed border-admin-border bg-admin-surface-alt text-admin-ink-dim`;
export const POS_CARD = "rounded-[14px] border border-admin-border bg-admin-card";
export const POS_FIELD =
  "h-[48px] w-full rounded-[12px] border border-admin-border bg-admin-card px-[14px] font-admin-body text-[15px] text-admin-ink placeholder:text-admin-ink-dim";

export function PosAction({
  children,
  onClick,
  reason,
  tone = "secondary",
  disabled = false,
  className,
  testAttr,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Set = not wired: disabled, with the sentence as the title. */
  reason?: string | null;
  tone?: "primary" | "secondary" | "outline" | "danger";
  disabled?: boolean;
  className?: string;
  /** A hint for a wired-but-disabled control (e.g. "class is full"). */
  title?: string;
  /** A `data-pos-classes-*` hook for the journey. */
  testAttr?: Record<string, string>;
}) {
  const off = Boolean(reason) || disabled;
  const base = reason
    ? POS_BTN_OFF
    : tone === "primary"
      ? POS_BTN_PRIMARY
      : tone === "outline"
        ? POS_BTN_OUTLINE
        : POS_BTN_SECONDARY;
  return (
    <button
      type="button"
      disabled={off}
      aria-disabled={off || undefined}
      title={reason ?? title}
      data-not-wired={reason ? "true" : undefined}
      {...testAttr}
      className={cn(base, tone === "danger" && !reason && "border-admin-critical/40 text-admin-red", "disabled:cursor-not-allowed disabled:opacity-60", className)}
      onClick={off ? undefined : onClick}
    >
      {children}
    </button>
  );
}

export type PosPillTone = "green" | "indigo" | "coral" | "slate" | "critical" | "royal";

const TONE: Record<PosPillTone, string> = {
  green: "bg-admin-success-soft text-admin-green",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-amber-soft text-admin-amber",
  critical: "bg-admin-critical-soft text-admin-red",
  royal: "bg-admin-royal-soft text-admin-royal",
};

export function PosPill({ tone, children, attrs, className }: { tone: PosPillTone; children: ReactNode; attrs?: Record<string, string>; className?: string }) {
  return (
    <span {...attrs} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-[10px] py-[3px] font-admin-body text-[12px] font-semibold", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** The larger status chip under a screen title (B05: "Full · 12 of 12 booked"). */
export function PosChip({ tone, children, size = "md" }: { tone: PosPillTone; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center gap-[6px] whitespace-nowrap rounded-full font-admin-body font-semibold", size === "sm" ? "px-[10px] py-[4px] text-[13px]" : "px-[12px] py-[6px] text-[14px]", TONE[tone])}>
      {children}
    </span>
  );
}

/** Today / Due / Done, Appts / Classes, All / Not here / Problems. */
export function PosSegmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (id: T) => void;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 gap-[2px] rounded-[12px] bg-admin-surface-alt p-[4px]">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-[9px] font-admin-body font-semibold",
              size === "lg" ? "px-[16px] py-[10px] text-[15px]" : size === "sm" ? "px-[10px] py-[7px] text-[13px]" : "px-[12px] py-[8px] text-[14px]",
              active ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted hover:text-admin-ink",
            )}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PosFact({ label, children, muted = false }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[8px] font-admin-body text-[15px] last:border-b-0">
      <span className="text-admin-ink-muted">{label}</span>
      <span className={cn("text-right font-semibold tabular-nums", muted ? "text-admin-ink-dim" : "text-admin-ink")}>{children}</span>
    </div>
  );
}

/** A sheet over the screen (B02, B04): title, close, body, footer. */
export function PosSheet({
  title,
  subtitle,
  onClose,
  closeLabel,
  children,
  footer,
  attrs,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer: ReactNode;
  attrs?: Record<string, string>;
}) {
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-admin-ink/40" role="presentation">
      <div
        role="dialog"
        aria-label={title}
        {...attrs}
        className="flex h-full w-[600px] max-w-full flex-col border-l border-admin-border bg-admin-card"
      >
        <div className="flex items-start justify-between gap-[12px] border-b border-admin-border px-[24px] py-[18px]">
          <div>
            <div className="font-admin-body text-[20px] font-semibold text-admin-ink">{title}</div>
            {subtitle ? <div className="font-admin-body text-[14px] text-admin-ink-muted">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            className="flex h-[44px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink hover:bg-admin-border"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[24px] py-[18px]">{children}</div>
        <div className="flex items-center justify-between gap-[12px] border-t border-admin-border px-[24px] py-[16px]">{footer}</div>
      </div>
    </div>
  );
}

/** The "A place opened up" dialog (B06). */
export function PosDialog({ title, subtitle, onClose, closeLabel, children, footer }: { title: string; subtitle?: string; onClose: () => void; closeLabel: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-admin-ink/40 p-[24px]" role="presentation">
      <div role="dialog" aria-label={title} className="flex w-[560px] max-w-full flex-col rounded-[20px] bg-admin-card shadow-[0_12px_40px_rgba(11,11,13,0.18)]">
        <div className="flex items-start justify-between gap-[12px] border-b border-admin-border px-[22px] py-[18px]">
          <div>
            <div className="font-admin-body text-[20px] font-semibold text-admin-ink">{title}</div>
            {subtitle ? <div className="font-admin-body text-[14px] text-admin-ink-muted">{subtitle}</div> : null}
          </div>
          <button type="button" aria-label={closeLabel} className="flex h-[44px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink hover:bg-admin-border" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-[10px] px-[22px] py-[18px]">{children}</div>
        <div className="flex items-center justify-between gap-[12px] border-t border-admin-border px-[22px] py-[16px]">{footer}</div>
      </div>
    </div>
  );
}

/** One choice row in a dialog (B06): a radio, a title, a hint. */
export function PosChoice({ selected, title, hint, onSelect, disabled = false, reason }: { selected: boolean; title: string; hint: string; onSelect: () => void; disabled?: boolean; reason?: string | null }) {
  const off = disabled || Boolean(reason);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={off}
      title={reason ?? undefined}
      className={cn(
        "flex w-full items-start gap-[12px] rounded-[12px] border px-[14px] py-[12px] text-left font-admin-body",
        selected ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card",
        off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-admin-border-strong",
      )}
      onClick={off ? undefined : onSelect}
    >
      <span className={cn("mt-[3px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2", selected ? "border-admin-brand" : "border-admin-border-strong")}>
        {selected ? <span className="h-[8px] w-[8px] rounded-full bg-admin-brand" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-admin-ink">{title}</span>
        <span className="block text-[13px] text-admin-ink-muted">{hint}</span>
      </span>
    </button>
  );
}
