"use client";

/**
 * catalog-ui.tsx — the pieces the Catalog boards are drawn with, on top of
 * the Appointments kit (`appointments-classes-ui`): the page heading, the
 * segment strip as links, the labelled field (36px input, 12px label,
 * 11.5px hint), the list card with its uppercase head and 12/18 rows, the
 * W05 mode card, the W06 channel row with its switch, the editor's tab
 * strip and the right column's eyebrow.
 *
 * Polish 5 (the second pass): the boards' 26px page title, 1.2 line-height
 * on every row, 34px inputs, 33px list heads, the block pill that fills a
 * list cell, the triangle glyph on every note, `RevealRow` (a `+ Add …`
 * pill that opens its inputs, as the boards draw it).
 *
 * A control the engine has no writer for is DISABLED WITH ITS REASON as its
 * title and `data-not-wired`; nothing here is a control that silently does
 * nothing. Token classes only; inline styles are frozen under this tree.
 */

// Every Link here points at THIS page with other search params. `prefetch`
// is off on all of them: a prefetch is a server render of a page the shell
// already has, and a catalog of nine rows was firing nine of them on landing.
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "../../primitives";

export const CARD = "rounded-[14px] border border-admin-border bg-admin-card";
export const INPUT =
  "h-[34px] w-full min-w-0 rounded-[9px] border border-admin-border bg-admin-card px-[12px] font-admin-body text-admin-13 leading-[1.2] text-admin-ink disabled:cursor-not-allowed disabled:bg-admin-surface-alt disabled:text-admin-ink-muted";
/** A select under the kit's chevron: `appearance-none`, room for the glyph, inside `SelectShell`. */
export const SELECT = `${INPUT} appearance-none pr-[30px]`;

export const BUTTON_SMALL =
  "inline-flex h-[30px] cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[9px] border border-transparent bg-admin-surface-alt px-[14px] font-admin-body text-[12px] font-semibold text-admin-ink hover:bg-admin-border-soft disabled:cursor-not-allowed disabled:opacity-50";

export function PageHeading({ title, intro, actions, testId }: { title: string; intro: string; actions?: ReactNode; testId?: string }) {
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

/** W01's segment strip: real links, the active one white. */
export function SegmentLinks({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{ id: string; label: string; href: string; active: boolean; reason?: string | null }>;
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex shrink-0 gap-[2px] rounded-[9px] bg-admin-surface-alt p-[3px] max-[720px]:flex max-[720px]:w-full max-[720px]:gap-[6px] max-[720px]:overflow-x-auto max-[720px]:rounded-none max-[720px]:bg-transparent max-[720px]:p-0 max-[720px]:[scrollbar-width:none]"
    >
      {items.map((s) =>
        s.reason ? (
          <span
            key={s.id}
            title={s.reason}
            aria-disabled
            data-not-wired="true"
            className="cursor-not-allowed rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold text-admin-ink-dim max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:rounded-full max-[720px]:border max-[720px]:border-admin-border max-[720px]:bg-admin-card max-[720px]:px-[12px] max-[720px]:py-[7px] max-[720px]:text-[13px] max-[720px]:opacity-50"
          >
            {s.label}
          </span>
        ) : (
          <Link
            key={s.id}
            href={s.href}
            prefetch={false}
            aria-current={s.active ? "page" : undefined}
            className={`rounded-[7px] px-[10px] py-[5px] font-admin-body text-[12px] font-semibold no-underline max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:rounded-full max-[720px]:border max-[720px]:px-[12px] max-[720px]:py-[7px] max-[720px]:text-[13px] max-[720px]:shadow-none ${
              s.active
                ? "bg-admin-card text-admin-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] max-[720px]:border-admin-ink max-[720px]:bg-admin-ink max-[720px]:text-white"
                : "text-admin-ink-muted hover:text-admin-ink max-[720px]:border-admin-border max-[720px]:bg-admin-card"
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
  quiet = false,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  hint?: string | null;
  /** Set when the control below is disabled: drawn as the hint, in the muted tone. */
  reason?: string | null;
  /** The reason stays on the title only (a row of fields that share one sentence prints it once). */
  quiet?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const under = quiet ? hint : (reason ?? hint);
  return (
    <div className={`flex min-w-0 flex-col ${className}`} title={reason ?? undefined} data-not-wired={reason ? "true" : undefined}>
      <div className="mb-[6px] flex gap-[4px] font-admin-body text-[12.5px] font-semibold leading-[1.2] text-admin-ink">
        {label}
        {required ? <span className="text-admin-coral">*</span> : null}
      </div>
      {children}
      {under ? <div className="mt-[6px] font-admin-body text-[11.5px] leading-[1.25] text-admin-ink-dim">{under}</div> : null}
    </div>
  );
}

/** A 14px section title with its one-line explanation (W03 "Base price"). */
export function SectionHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <div>
      <h2 className="m-0 font-admin-body text-[14px]! font-semibold leading-[1.2] text-admin-ink">{title}</h2>
      {intro ? <p className="m-0 mt-[4px] font-admin-body text-[12px] leading-[1.2] text-admin-ink-muted">{intro}</p> : null}
    </div>
  );
}

/** The uppercase head of a list card. `cols` is a `grid-cols-[...]` class. */
export function ListHead({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className={`grid items-center gap-[12px] px-[18px] py-[10px] font-admin-body text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted max-[720px]:hidden ${cols}`}>
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
      className={`grid items-center gap-[12px] border-t border-admin-border-soft px-[18px] py-[12px] font-admin-body text-[12.5px] leading-[1.2] text-admin-ink ${cols} ${className}`}
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
      className={`flex items-start gap-[10px] rounded-[12px] border px-[12px] py-[9px] text-left font-admin-body leading-[1.2] ${
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
        <span className="block text-[13px] font-semibold leading-[1.2] text-admin-ink">{title}</span>
        <span className="mt-[2px] block text-[11.5px] leading-[1.25] text-admin-ink-muted">{note}</span>
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
    <div className="flex items-center gap-[12px] border-t border-admin-border-soft px-[16px] py-[11px] leading-[1.2] first:border-t-0" data-testid={testId}>
      <Switch on={on} onChange={onChange} label={name} reason={reason} />
      <div className="min-w-0 flex-1">
        <div className="font-admin-body text-[13px] font-semibold text-admin-ink">{name}</div>
        <div className="mt-[3px] font-admin-body text-[11.5px] text-admin-ink-muted">{note}</div>
      </div>
      <span className="font-admin-body text-[12px] text-admin-ink-muted">{overrideLabel}</span>
      <span className="w-[60px] text-right font-admin-body text-[16px] font-bold tabular-nums text-admin-ink">{override}</span>
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
    <nav aria-label={label} className="flex gap-[2px] border-b border-admin-border max-[720px]:gap-[6px] max-[720px]:overflow-x-auto max-[720px]:border-b-0 max-[720px]:[scrollbar-width:none]">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          prefetch={false}
          replace
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={`-mb-px border-b-2 px-[12px] py-[8px] font-admin-body text-admin-13 leading-[1.2] no-underline max-[720px]:mb-0 max-[720px]:shrink-0 max-[720px]:whitespace-nowrap max-[720px]:rounded-full max-[720px]:border max-[720px]:px-[12px] max-[720px]:py-[7px] max-[720px]:font-semibold ${
            tab.active
              ? "border-admin-brand font-semibold text-admin-ink max-[720px]:border-admin-ink max-[720px]:bg-admin-ink max-[720px]:text-white"
              : "border-transparent font-medium text-admin-ink-muted hover:text-admin-ink max-[720px]:border-admin-border max-[720px]:bg-admin-card"
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
    <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[7px] font-admin-body text-admin-13 leading-[1.2] last:border-b-0">
      <span className="text-admin-ink-muted">{label}</span>
      <span className={`text-right font-semibold tabular-nums ${muted ? "text-admin-ink-dim" : "text-admin-ink"}`}>{value}</span>
    </div>
  );
}

/** The indigo note under a right column ("Price per item means..."). */
export function Note({ children, tone = "indigo" }: { children: ReactNode; tone?: "indigo" | "warn" }) {
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

/** The kebab at the end of a row, opening a small menu. */
export function RowMenuButton({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className="inline-flex h-[18px] w-[22px] cursor-pointer items-center justify-center rounded-[5px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
    >
      <Icon name="ellipsis" size={14} stroke={1.75} />
    </button>
  );
}

/**
 * The board's list-cell pill (W01's Type and Status, W04's availability):
 * a tinted block that fills its column, 17px tall, the label on the left.
 */
export type BlockTone = "green" | "coral" | "slate" | "indigo";
const BLOCK_TONE: Record<BlockTone, string> = {
  green: "bg-admin-success-soft text-admin-success-deep",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-surface-alt text-admin-ink",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
};

export function BlockPill({ tone, children, testId, state, className = "" }: { tone: BlockTone; children: ReactNode; testId?: string; state?: string; className?: string }) {
  return (
    <span
      data-testid={testId}
      data-state={state}
      className={`flex h-[17px] w-full min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[5px] px-[8px] font-admin-body text-[11.5px] font-semibold leading-none ${BLOCK_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** The compact 17px chip inside a cell (W01's channels): grey, or the brand's tint. */
export function Chip({ tone = "slate", children }: { tone?: "slate" | "brand"; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[17px] items-center whitespace-nowrap rounded-[5px] px-[7px] font-admin-body text-[11px] font-semibold leading-none ${
        tone === "brand" ? "bg-admin-brand-soft text-admin-brand" : "bg-admin-surface-alt text-admin-ink"
      }`}
    >
      {children}
    </span>
  );
}

/** The board's `⋮⋮` drag handle at the head of a row; decorative until reordering has a writer here. */
export function DragHandle({ reason }: { reason?: string | null }) {
  return (
    <span aria-hidden title={reason ?? undefined} className="inline-flex w-[12px] shrink-0 flex-col items-center justify-center gap-[2px] text-admin-ink-dim">
      <span className="flex gap-[2px]"><span className="h-[2px] w-[2px] rounded-full bg-current" /><span className="h-[2px] w-[2px] rounded-full bg-current" /></span>
      <span className="flex gap-[2px]"><span className="h-[2px] w-[2px] rounded-full bg-current" /><span className="h-[2px] w-[2px] rounded-full bg-current" /></span>
      <span className="flex gap-[2px]"><span className="h-[2px] w-[2px] rounded-full bg-current" /><span className="h-[2px] w-[2px] rounded-full bg-current" /></span>
    </span>
  );
}

/** The grey `+ Add …` pill the boards end a card with (W04, W05, W07, PackageEditor). */
export function AddPill({ children, onClick, disabled, reason, testId, className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; reason?: string | null; testId?: string; className?: string }) {
  const off = disabled || Boolean(reason);
  return (
    <button
      type="button"
      disabled={off}
      title={reason ?? undefined}
      data-not-wired={reason ? "true" : undefined}
      data-testid={testId}
      onClick={off ? undefined : onClick}
      className={`${BUTTON_SMALL} ${className}`}
    >
      <Icon name="plus" size={12} stroke={2} />
      {children}
    </button>
  );
}

/** The board's white full-width `Edit` button under a card's rows (W08, W09). */
export function CardButton({ children, reason, onClick, testId }: { children: ReactNode; reason?: string | null; onClick?: () => void; testId?: string }) {
  return (
    <button
      type="button"
      disabled={Boolean(reason)}
      title={reason ?? undefined}
      data-not-wired={reason ? "true" : undefined}
      data-testid={testId}
      onClick={reason ? undefined : onClick}
      className="inline-flex h-[30px] w-full cursor-pointer items-center justify-center rounded-[9px] border border-admin-border bg-admin-card font-admin-body text-[12.5px] font-semibold leading-[1.2] text-admin-ink hover:border-admin-border-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
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
