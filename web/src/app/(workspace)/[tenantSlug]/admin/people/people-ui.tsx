"use client";

/**
 * people-ui.tsx — the small pieces the People boards are drawn with, on top
 * of the Appointments & Classes kit (buttons, pills, filter chips, UsedIn)
 * so the two families read as one language: the hat chip, the stat tile,
 * the tab strip, the table frame, the initial avatar, the facts card.
 *
 * Measured against the boards at 1440 (second pass): 1.2 line-height on
 * every row, 33px table heads, 38px rows, 48px stat tiles with 24px
 * figures, 36px tabs, the block status pill that fills its cell.
 *
 * Token classes only; no hex literals under (workspace).
 */

import type { ReactNode } from "react";

import { CARD } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { Icon } from "@/components/admin/shell/internal/primitives";
import type { PersonHat } from "@/lib/people/hats";

export { CARD };

/** The boards' three hat colours: Public profile royal, Bookable green, Access brand. */
const HAT_TONE: Record<PersonHat, string> = {
  publicProfile: "bg-admin-royal-soft text-admin-royal-deep",
  bookable: "bg-admin-success-soft text-admin-success-deep",
  access: "bg-admin-brand-soft text-admin-brand-deep",
};

/** The board's 11px chip on a 1.2 line: 17px tall. */
const CHIP = "inline-flex items-center whitespace-nowrap rounded-full px-[8px] py-[2px] font-admin-body text-admin-11 font-semibold leading-[1.2]";

export function HatChip({ hat, label, off = false }: { hat: PersonHat; label: string; off?: boolean }) {
  return (
    <span data-hat={hat} data-on={off ? "false" : "true"} className={`${CHIP} ${off ? "bg-admin-surface-alt text-admin-ink-dim line-through" : HAT_TONE[hat]}`}>
      {label}
    </span>
  );
}

/** A grey chip for a state that is not a hat: "Contractor", "Person". */
export function MutedChip({ children }: { children: ReactNode }) {
  return <span className={`${CHIP} bg-admin-surface-alt text-admin-ink-muted`}>{children}</span>;
}

export type StatTone = "green" | "slate" | "royal" | "brand";
const DOT: Record<StatTone, string> = {
  green: "bg-admin-green",
  slate: "bg-admin-ink-dim",
  royal: "bg-admin-royal",
  brand: "bg-admin-brand",
};

/** Visible · 49 (W27): a 48px tile, the dot, the 12px label, the 24px figure. */
export function StatTile({ tone, label, value, testId }: { tone: StatTone; label: string; value: number; testId?: string }) {
  return (
    <div className={CARD} data-testid={testId}>
      <div className="flex items-center gap-[10px] px-[16px] py-[9px] leading-[1.2]">
        <span aria-hidden className={`h-[8px] w-[8px] shrink-0 rounded-full ${DOT[tone]}`} />
        <span className="flex-1 font-admin-body text-[12px] text-admin-ink-muted">{label}</span>
        <span className="font-admin-body text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-admin-ink">{value}</span>
      </div>
    </div>
  );
}

/** The tab strip under the title: Everyone · Talent · 57 · ... (36px tall). */
export function TabStrip<T extends string>({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number | null; href?: string }>;
  active: T | null;
  onSelect: (id: T) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex gap-[2px] border-b border-admin-border">
      {tabs.map((tab) => {
        const on = tab.id === active;
        const className = `-mb-px cursor-pointer whitespace-nowrap border-b-2 px-[12px] py-[9px] font-admin-body text-[13.5px] leading-[1.2] ${
          on ? "border-admin-brand font-semibold text-admin-ink" : "border-transparent font-medium text-admin-ink-muted hover:text-admin-ink"
        }`;
        const text = tab.count == null ? tab.label : `${tab.label} · ${tab.count}`;
        return tab.href ? (
          <a key={tab.id} href={tab.href} className={className}>
            {text}
          </a>
        ) : (
          <button key={tab.id} type="button" aria-current={on ? "page" : undefined} className={className} onClick={() => onSelect(tab.id)}>
            {text}
          </button>
        );
      })}
    </nav>
  );
}

/** The boards' table: a 33px uppercase head row, soft dividers, a 38px row per person. */
export function Table({ head, children, testId }: { head: ReadonlyArray<string>; children: ReactNode; testId?: string }) {
  return (
    <div className={`${CARD} overflow-x-auto`} data-testid={testId}>
      <table className="w-full border-collapse font-admin-body text-admin-13 leading-[1.2]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={`${i}-${h}`}
                scope="col"
                className="whitespace-nowrap border-b border-admin-border px-[16px] py-[10px] text-left text-admin-11 font-semibold uppercase leading-[1.2] tracking-[0.05em] text-admin-ink-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const TD = "border-b border-admin-border-soft px-[16px] py-[11px] align-middle leading-[1.2] text-admin-ink";
export const TD_MUTED = `${TD} text-admin-ink-muted`;

/** A row that opens the person: the whole row is one button for the keyboard. */
export function PersonCell({ name, onOpen, selected }: { name: string; onOpen: () => void; selected: boolean }) {
  return (
    <td className={TD}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        className="cursor-pointer text-left font-semibold leading-[1.2] text-admin-ink hover:underline"
        onClick={onOpen}
      >
        {name}
      </button>
    </td>
  );
}

/**
 * The board's status cell (W29): a tinted block that fills its column, 17px
 * tall, the label on the left. The compact pill stays beside a title.
 */
export type BlockTone = "green" | "coral" | "critical" | "slate";
const BLOCK_TONE: Record<BlockTone, string> = {
  green: "bg-admin-success-soft text-admin-success-deep",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  critical: "bg-admin-critical-soft text-admin-red",
  slate: "bg-admin-surface-alt text-admin-ink-muted",
};

export function BlockPill({ tone, children, testId }: { tone: BlockTone; children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className={`flex h-[17px] w-full min-w-[96px] items-center overflow-hidden rounded-[5px] px-[8px] font-admin-body text-[11.5px] font-semibold leading-none ${BLOCK_TONE[tone]}`}>
      {children}
    </span>
  );
}

/** The "···" at the end of a row; opens the person like the name does. */
export function RowMenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-[16px] w-[20px] cursor-pointer items-center justify-center rounded-[5px] align-middle text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
      onClick={onClick}
    >
      <Icon name="ellipsis" size={14} stroke={1.75} />
    </button>
  );
}

/** The initial-in-a-tint avatar the roster draws when there is no headshot. */
export function InitialAvatar({ name, src, className = "h-[32px] w-[32px] text-[13px]" }: { name: string; src: string | null; className?: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a headshot from the media bucket, sized by the caller
    <img src={src} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-admin-surface-alt font-admin-body font-semibold text-admin-ink-muted ${className}`}
    >
      {initial}
    </span>
  );
}

/**
 * The boards' key/value row (W26's cards, W30's facts, W32's combinations):
 * a muted label on the left, the value semibold on the right, left-aligned
 * inside its own box so a wrapped value reads as a paragraph. 29px tall on
 * one line; `tall` is the 37px row W32 draws.
 */
export function KeyValue({ label, children, muted = false, tall = false }: { label: ReactNode; children: ReactNode; muted?: boolean; tall?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft font-admin-body text-admin-13 leading-[1.2] last:border-b-0 ${tall ? "py-[10px]" : "py-[6px]"}`}>
      <span className="shrink-0 text-admin-ink-muted">{label}</span>
      <span className={`min-w-0 font-semibold ${muted ? "text-admin-ink-dim" : "text-admin-ink"}`}>{children}</span>
    </div>
  );
}

/** The two-column facts card under a table (W30's footers). */
export function FactsCard({ rows }: { rows: ReadonlyArray<{ label: string; value: ReactNode; muted?: boolean }> }) {
  return (
    <div className={`${CARD} px-[16px] py-[8px]`}>
      {rows.map((r) => (
        <KeyValue key={r.label} label={r.label} muted={r.muted}>
          <span className="block text-right">{r.value}</span>
        </KeyValue>
      ))}
    </div>
  );
}

/** A callout with an alert glyph: the board's tinted note under a table. */
export function Callout({ tone, children, testId }: { tone: "indigo" | "coral" | "slate"; children: ReactNode; testId?: string }) {
  const cls =
    tone === "indigo"
      ? "bg-admin-indigo-soft text-admin-indigo-deep"
      : tone === "coral"
        ? "bg-admin-coral-soft text-admin-coral-deep"
        : "bg-admin-surface-alt text-admin-ink-muted";
  return (
    <div data-testid={testId} className={`flex items-start gap-[10px] rounded-[10px] px-[16px] py-[12px] font-admin-body text-[12.5px] leading-[1.4] ${cls}`}>
      <span className="mt-[1px] shrink-0">
        <Icon name="alert" size={14} stroke={1.75} />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="leading-[1.2]">
      <h3 className="m-0 font-admin-body text-[15px]! font-semibold leading-[1.2] text-admin-ink">{children}</h3>
      {sub ? <p className="m-0 mt-[3px] font-admin-body text-[12.5px] leading-[1.3] text-admin-ink-muted">{sub}</p> : null}
    </div>
  );
}

/** The boards' 34px select: a native select under the kit's own chevron, no native arrow. */
export function SelectShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`relative block ${className}`}>
      {children}
      <span aria-hidden className="pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
        <Icon name="chevron-down" size={13} stroke={1.75} />
      </span>
    </span>
  );
}
