"use client";

/**
 * catalog-ui.tsx — the pieces the Catalog boards are drawn with, on top of
 * the Appointments kit (`appointments-classes-ui`): the page heading, the
 * segment strip as links, the labelled field (36px input, 12px label,
 * 11.5px hint), the list card with its uppercase head and 12/18 rows, the
 * W05 mode card, the W06 channel row with its switch, the editor's tab
 * strip and the right column's eyebrow.
 *
 * A control the engine has no writer for is DISABLED WITH ITS REASON as its
 * title and `data-not-wired`; nothing here is a control that silently does
 * nothing. Token classes only; inline styles are frozen under this tree.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "../../primitives";

export const CARD = "rounded-[14px] border border-admin-border bg-admin-card";
export const INPUT =
  "h-[36px] w-full min-w-0 rounded-[9px] border border-admin-border bg-admin-card px-[12px] font-admin-body text-admin-13 text-admin-ink disabled:cursor-not-allowed disabled:bg-admin-surface-alt disabled:text-admin-ink-muted";
export const BUTTON_SMALL =
  "inline-flex h-[30px] cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border border-transparent bg-admin-surface-alt px-[14px] font-admin-body text-[12px] font-semibold text-admin-ink hover:bg-admin-border-soft disabled:cursor-not-allowed disabled:opacity-50";

export function PageHeading({ title, intro, actions, testId }: { title: string; intro: string; actions?: ReactNode; testId?: string }) {
  return (
    <header className="flex items-center justify-between gap-[12px]" data-testid={testId}>
      <div className="min-w-0">
        <h1 className="m-0 font-admin-body text-[22px]! font-semibold leading-[1.15] tracking-[-0.02em] text-admin-ink">{title}</h1>
        <p className="m-0 mt-[4px] font-admin-body text-admin-13 text-admin-ink-muted">{intro}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-[8px]">{actions}</div> : null}
    </header>
  );
}

/** W01's segment strip: real links, the active one white. */
export function SegmentLinks({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{ id: string; label: string; href: string; active: boolean; reason?: string | null }>;
}) {
  return (
    <nav aria-label={label} className="inline-flex shrink-0 gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px]">
      {items.map((s) =>
        s.reason ? (
          <span
            key={s.id}
            title={s.reason}
            aria-disabled
            data-not-wired="true"
            className="cursor-not-allowed rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold text-admin-ink-dim"
          >
            {s.label}
          </span>
        ) : (
          <Link
            key={s.id}
            href={s.href}
            aria-current={s.active ? "page" : undefined}
            className={`rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold no-underline ${
              s.active ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-admin-ink-muted hover:text-admin-ink"
            }`}
          >
            {s.label}
          </Link>
        ),
      )}
    </nav>
  );
}

/** A labelled field: 12px label, the control, an 11.5px hint or reason. */
export function Field({
  label,
  required,
  hint,
  reason,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  hint?: string | null;
  /** Set when the control below is disabled: drawn as the hint, in the muted tone. */
  reason?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`} title={reason ?? undefined} data-not-wired={reason ? "true" : undefined}>
      <div className="mb-[6px] flex gap-[4px] font-admin-body text-[12px] font-semibold text-admin-ink">
        {label}
        {required ? <span className="text-admin-coral">*</span> : null}
      </div>
      {children}
      {reason ?? hint ? <div className="mt-[5px] font-admin-body text-[11.5px] text-admin-ink-dim">{reason ?? hint}</div> : null}
    </div>
  );
}

/** A 14px section title with its one-line explanation (W03 "Base price"). */
export function SectionHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <div>
      <h2 className="m-0 font-admin-body text-[14px]! font-semibold text-admin-ink">{title}</h2>
      {intro ? <p className="m-0 mt-[2px] font-admin-body text-[12px] text-admin-ink-muted">{intro}</p> : null}
    </div>
  );
}

/** The uppercase head of a list card. `cols` is a `grid-cols-[...]` class. */
export function ListHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className={`grid gap-[12px] px-[18px] py-[10px] font-admin-body text-[11px] font-semibold uppercase tracking-[0.05em] text-admin-ink-muted ${cols}`}>
      {children}
    </div>
  );
}

export function ListRow({
  cols,
  children,
  testId,
  className = "",
}: {
  cols: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`grid items-center gap-[12px] border-t border-admin-border-soft px-[18px] py-[12px] font-admin-body text-[12.5px] text-admin-ink ${cols} ${className}`}
    >
      {children}
    </div>
  );
}

/** W05's availability mode card: a radio drawn as a card. */
export function ModeCard({
  title,
  note,
  active,
  onSelect,
  reason,
  testId,
}: {
  title: string;
  note: string;
  active: boolean;
  onSelect?: () => void;
  reason?: string | null;
  testId?: string;
}) {
  const off = Boolean(reason);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={off}
      title={reason ?? undefined}
      data-not-wired={reason ? "true" : undefined}
      data-testid={testId}
      onClick={off ? undefined : onSelect}
      className={`flex items-start gap-[10px] rounded-[12px] border p-[12px] text-left font-admin-body ${
        active ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card"
      } ${off ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        aria-hidden
        className={`mt-[2px] inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          active ? "border-admin-brand bg-admin-brand" : "border-admin-border-strong bg-admin-card"
        }`}
      >
        {active ? <span className="h-[6px] w-[6px] rounded-full bg-admin-card" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-admin-ink">{title}</span>
        <span className="mt-[2px] block text-[11.5px] leading-[1.4] text-admin-ink-muted">{note}</span>
      </span>
    </button>
  );
}

/** A switch (W06 channel rows, W07 QR ordering). */
export function Switch({
  on,
  onChange,
  label,
  reason,
  testId,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label: string;
  reason?: string | null;
  testId?: string;
}) {
  const off = Boolean(reason);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={off}
      title={reason ?? undefined}
      data-not-wired={reason ? "true" : undefined}
      data-testid={testId}
      onClick={off ? undefined : () => onChange?.(!on)}
      className={`relative inline-flex h-[20px] w-[34px] shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-admin-brand" : "bg-admin-border-strong"
      } ${off ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        aria-hidden
        className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-admin-card shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] ${
          on ? "left-[16px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

/** W06's channel row: switch, name and note, then the price override. */
export function ChannelRow({
  name,
  note,
  on,
  onChange,
  reason,
  override,
  overrideLabel,
  testId,
}: {
  name: string;
  note: string;
  on: boolean;
  onChange?: (next: boolean) => void;
  reason?: string | null;
  override: string;
  overrideLabel: string;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-[12px] border-t border-admin-border-soft px-[16px] py-[12px] first:border-t-0" data-testid={testId}>
      <Switch on={on} onChange={onChange} label={name} reason={reason} />
      <div className="min-w-0 flex-1">
        <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{name}</div>
        <div className="font-admin-body text-[12px] text-admin-ink-muted">{note}</div>
      </div>
      <span className="font-admin-body text-[12px] text-admin-ink-muted">{overrideLabel}</span>
      <span className="w-[60px] text-right font-admin-body text-[12.5px] font-semibold tabular-nums text-admin-ink">{override}</span>
    </div>
  );
}

/** The editor's tab strip, as links: `aria-current` on the open one. */
export function TabStrip({
  label,
  tabs,
}: {
  label: string;
  tabs: ReadonlyArray<{ id: string; label: string; href: string; active: boolean }>;
}) {
  return (
    <nav aria-label={label} className="flex gap-[2px] border-b border-admin-border">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          replace
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={`-mb-px border-b-2 px-[12px] py-[10px] font-admin-body text-admin-13 no-underline ${
            tab.active ? "border-admin-brand font-semibold text-admin-ink" : "border-transparent font-medium text-admin-ink-muted hover:text-admin-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** The right column's eyebrow ("On the Counter tile"). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-admin-body text-[11px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{children}</div>;
}

/** W03's right-column key/value row. */
export function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-[12px] py-[6px] font-admin-body text-admin-13">
      <span className="text-admin-ink-muted">{label}</span>
      <span className={`text-right font-medium tabular-nums ${muted ? "text-admin-ink-dim" : "text-admin-ink"}`}>{value}</span>
    </div>
  );
}

/** The indigo note under a right column ("Price per item means..."). */
export function Note({ children, tone = "indigo" }: { children: ReactNode; tone?: "indigo" | "warn" }) {
  return (
    <div
      className={`flex items-start gap-[8px] rounded-[10px] px-[12px] py-[10px] font-admin-body text-[12.5px] leading-[1.45] ${
        tone === "warn" ? "bg-admin-coral-soft text-admin-coral-deep" : "bg-admin-indigo-soft text-admin-indigo"
      }`}
    >
      <Icon name="info" size={14} stroke={1.75} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** The kebab at the end of a row, opening a small menu. */
export function RowMenuButton({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className="inline-flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-[6px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
    >
      <Icon name="ellipsis" size={14} stroke={1.75} />
    </button>
  );
}
