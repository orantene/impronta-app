"use client";

/**
 * classes-ui.tsx — the pieces the Front desk boards (B01 to B06, A09) are
 * drawn with, at tablet size: the two-pane list + detail, the chips, the
 * pills, the action buttons, the sheet that slides over the list, the
 * centred dialog. Token classes only; a control the engine has no action
 * for is disabled WITH its reason as the title (never a dead button).
 *
 * SIZES ARE THE BOARDS'. A button is 48px / 15px / radius 12 (`md`), the
 * inline row action 44px / 14px / radius 11 (`sm`), a sheet's confirm 56px /
 * 16px / radius 14 (`lg`), the pane's Collect 60px / 17px / radius 14 (`xl`);
 * every border is 1.5px; a list pill is 11px on 2px 8px, a detail chip 13.5px
 * on 5px 11px, a header-strip chip 14px on 7px 11px.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PosActionSize = "sm" | "md" | "lg" | "xl";

const SIZE: Record<PosActionSize, string> = {
  sm: "h-[44px] rounded-[11px] px-[14px] text-[14px]",
  md: "h-[48px] rounded-[12px] px-[18px] text-[15px]",
  lg: "h-[56px] rounded-[14px] px-[22px] text-[16px]",
  xl: "h-[60px] rounded-[14px] px-[24px] text-[17px]",
};

export const POS_BTN =
  "inline-flex items-center justify-center gap-[8px] whitespace-nowrap border-[1.5px] font-admin-body font-semibold leading-[1.2] [transition:background_var(--transition-admin-micro),border-color_var(--transition-admin-micro)]";
export const POS_BTN_PRIMARY = `${POS_BTN} ${SIZE.md} cursor-pointer border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep`;
export const POS_BTN_SECONDARY = `${POS_BTN} ${SIZE.md} cursor-pointer border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong`;
export const POS_BTN_OUTLINE = `${POS_BTN} ${SIZE.md} cursor-pointer border-admin-brand bg-admin-card text-admin-brand hover:bg-admin-brand-soft`;
export const POS_BTN_OFF = `${POS_BTN} ${SIZE.md} cursor-not-allowed border-transparent bg-admin-surface-alt text-admin-ink-dim`;
export const POS_CARD = "rounded-[16px] border border-admin-border bg-admin-card";
export const POS_FIELD =
  "h-[52px] w-full rounded-[12px] border-[1.5px] border-admin-border bg-admin-card px-[14px] font-admin-body text-[16px] leading-[1.2] text-admin-ink placeholder:text-admin-ink-dim";
/** The field's label ("Service", "Customer", "Pay") and its hint under it. */
export const POS_LABEL = "font-admin-body text-[14px] font-semibold leading-[1.2] text-admin-ink-muted";
export const POS_HINT = "font-admin-body text-[13.5px] leading-[1.3] text-admin-ink-dim";
/** "NEXT FREE", "BOOKED": the small caps eyebrow. */
export const POS_EYEBROW = "font-admin-body text-[12px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-admin-ink-muted";

export function PosAction({
  children,
  onClick,
  reason,
  tone = "secondary",
  size = "md",
  disabled = false,
  className,
  testAttr,
  title,
  type = "button",
  form,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Set = not wired: disabled, with the sentence as the title. */
  reason?: string | null;
  tone?: "primary" | "secondary" | "outline" | "danger";
  size?: PosActionSize;
  disabled?: boolean;
  className?: string;
  /** A hint for a wired-but-disabled control (e.g. "class is full"). */
  title?: string;
  /** A `data-pos-classes-*` hook for the journey. */
  testAttr?: Record<string, string>;
  type?: "button" | "submit";
  form?: string;
}) {
  const off = Boolean(reason) || disabled;
  const look = reason
    ? "cursor-not-allowed border-transparent bg-admin-surface-alt text-admin-ink-dim"
    : tone === "primary"
      ? "cursor-pointer border-admin-brand bg-admin-brand text-white hover:bg-admin-brand-deep"
      : tone === "outline"
        ? "cursor-pointer border-admin-brand bg-admin-card text-admin-brand hover:bg-admin-brand-soft"
        : tone === "danger"
          ? "cursor-pointer border-admin-critical/40 bg-admin-card text-admin-red hover:border-admin-critical"
          : "cursor-pointer border-admin-border bg-admin-card text-admin-ink hover:border-admin-border-strong";
  return (
    <button
      type={type}
      form={form}
      disabled={off}
      aria-disabled={off || undefined}
      title={reason ?? title}
      data-not-wired={reason ? "true" : undefined}
      {...testAttr}
      className={cn(POS_BTN, SIZE[size], look, "disabled:cursor-not-allowed disabled:opacity-60", className)}
      onClick={off ? undefined : onClick}
    >
      {children}
    </button>
  );
}

export type PosPillTone = "green" | "indigo" | "coral" | "slate" | "critical" | "royal" | "brand";

const TONE: Record<PosPillTone, string> = {
  green: "bg-admin-success-soft text-admin-green",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-amber-soft text-admin-amber",
  critical: "bg-admin-critical-soft text-admin-red",
  royal: "bg-admin-royal-soft text-admin-royal",
  brand: "bg-admin-brand-soft text-admin-brand",
};

/** The list row's pill (B01): 11px on 2px 8px. */
export function PosPill({ tone, children, attrs, className }: { tone: PosPillTone; children: ReactNode; attrs?: Record<string, string>; className?: string }) {
  return (
    <span
      {...attrs}
      className={cn("inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[8px] py-[2px] font-admin-body text-[11px] font-semibold leading-[1.2]", TONE[tone], className)}
    >
      {children}
    </span>
  );
}

/**
 * The larger chip: `sm` beside a title or a sale line (13.5px on 5px 11px,
 * B01), `md` in the strip under the header (14px on 7px 11px, B05).
 */
export function PosChip({ tone, children, size = "md" }: { tone: PosPillTone; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] whitespace-nowrap rounded-full font-admin-body font-semibold leading-[1.2]",
        size === "sm" ? "px-[11px] py-[5px] text-[13.5px]" : "px-[11px] py-[7px] text-[14px]",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Today / Due / Done (`lg`), Appts / Classes (`md`), All / Not here / Problems (`lg`). */
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
              "cursor-pointer whitespace-nowrap rounded-[9px] font-admin-body font-semibold leading-[1.2]",
              size === "lg" ? "px-[16px] py-[10px] text-[15px]" : size === "sm" ? "px-[10px] py-[7px] text-[13px]" : "px-[12px] py-[8px] text-[14px]",
              active ? "bg-admin-card text-admin-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-admin-ink-muted hover:text-admin-ink",
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

/** One row of a facts card: label left, value right, 15px on 8px. */
export function PosFact({ label, children, muted = false, attrs }: { label: string; children: ReactNode; muted?: boolean; attrs?: Record<string, string> }) {
  return (
    <div {...attrs} className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[8px] font-admin-body text-[15px] leading-[1.2] last:border-b-0">
      <span className="shrink-0 text-admin-ink-muted">{label}</span>
      <span className={cn("text-right font-semibold tabular-nums", muted ? "text-admin-ink-dim" : "text-admin-ink")}>{children}</span>
    </div>
  );
}

function CloseButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-[44px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] bg-admin-surface-alt text-admin-ink hover:bg-admin-border"
      onClick={onClose}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

function SheetHead({ title, subtitle, closeLabel, onClose }: { title: string; subtitle?: string; closeLabel: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-[12px] border-b border-admin-border px-[22px] pb-[16px] pt-[18px]">
      <div className="min-w-0 flex-1">
        <div className="font-admin-body text-[20px] font-bold leading-[1.2] tracking-[-0.01em] text-admin-ink">{title}</div>
        {subtitle ? <div className="mt-[3px] font-admin-body text-[14px] leading-[1.2] text-admin-ink-muted">{subtitle}</div> : null}
      </div>
      <CloseButton label={closeLabel} onClose={onClose} />
    </div>
  );
}

/** A sheet over the screen (B02, B04, A09): title, close, body, footer. */
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
    <div className="absolute inset-0 z-20 flex justify-end bg-admin-ink/35" role="presentation">
      <div
        role="dialog"
        aria-label={title}
        {...attrs}
        className="flex h-full w-[600px] max-w-full flex-col border-l border-admin-border bg-admin-card shadow-[-20px_0_60px_-30px_rgba(0,0,0,0.35)]"
      >
        <SheetHead title={title} subtitle={subtitle} closeLabel={closeLabel} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[22px] py-[18px]">{children}</div>
        <div className="flex items-center justify-between gap-[10px] border-t border-admin-border bg-admin-card px-[22px] py-[14px]">{footer}</div>
      </div>
    </div>
  );
}

/** The "A place opened up" dialog (B06): centred, 560 wide, radius 20. */
export function PosDialog({ title, subtitle, onClose, closeLabel, children, footer }: { title: string; subtitle?: string; onClose: () => void; closeLabel: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex justify-center bg-admin-ink/35 px-[24px] pt-[48px]" role="presentation">
      <div role="dialog" aria-label={title} className="flex max-h-[calc(100%-96px)] w-[560px] max-w-full flex-col overflow-hidden rounded-[20px] bg-admin-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]">
        <SheetHead title={title} subtitle={subtitle} closeLabel={closeLabel} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[22px] py-[18px]">{children}</div>
        <div className="flex items-center justify-between gap-[10px] border-t border-admin-border bg-admin-card px-[22px] py-[14px]">{footer}</div>
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
        "flex w-full items-start gap-[12px] rounded-[12px] border-[1.5px] px-[16px] py-[14px] text-left font-admin-body",
        selected ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card",
        off ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-admin-border-strong",
      )}
      onClick={off ? undefined : onSelect}
    >
      <span className={cn("mt-[1px] inline-flex h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px]", selected ? "border-[7px] border-admin-brand" : "border-admin-border-strong")} />
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink">{title}</span>
        {hint ? <span className="mt-[3px] block text-[14px] leading-[1.4] text-admin-ink-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

/** The soft notice at the bottom of a column (B05's problem, B06's policy). */
export function PosNote({ tone, children, role }: { tone: "coral" | "slate"; children: ReactNode; role?: "alert" | "status" }) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-[10px] rounded-[12px] px-[14px] py-[12px] font-admin-body text-[14px] font-medium leading-[1.45]",
        tone === "coral" ? "bg-admin-coral-soft text-admin-coral-deep" : "bg-admin-amber-soft text-admin-amber",
      )}
    >
      {children}
    </div>
  );
}

/** The 14/16/18px stroke icons the boards draw inside buttons and chips. */
export function PosIcon({ name, size = 18, className }: { name: "plus" | "calendar" | "tag" | "pass" | "scan" | "person" | "search" | "pin" | "chevron"; size?: number; className?: string }) {
  const path =
    name === "plus" ? (
      <path d="M12 5v14M5 12h14" />
    ) : name === "calendar" ? (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </>
    ) : name === "tag" ? (
      <>
        <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </>
    ) : name === "pass" ? (
      <>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M3 12h18M12 8v13M12 8s-4-6-4-2 4 2 4 2 4-6 4-2-4 2-4 2" />
      </>
    ) : name === "scan" ? (
      <>
        <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
        <path d="M7 12h10" />
      </>
    ) : name === "person" ? (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ) : name === "search" ? (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ) : name === "pin" ? (
      <>
        <path d="M12 21s7-6.5 7-11.5a7 7 0 0 0-14 0C5 14.5 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </>
    ) : (
      <path d="m6 9 6 6 6-6" />
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0", className)} aria-hidden>
      {path}
    </svg>
  );
}
