"use client";

/**
 * InboxSegments (Needs action / Waiting / All with counts), FilterChips (narrow,
 * never hide) and FilterSheet (the mobile bottom sheet). Boards D01, D02, M01.
 */

import type { KitCopy } from "./copy";
import { Btn, Chip, Icon } from "./primitives";
import { Sheet } from "./Sheet";

export type InboxSegment = "needs" | "wait" | "all";

export type InboxSegmentsProps = {
  readonly value: InboxSegment;
  readonly counts: Partial<Record<InboxSegment, number>>;
  readonly copy: KitCopy;
  readonly variant?: "desktop" | "mobile";
  readonly onChange: (segment: InboxSegment) => void;
};

const SEGMENTS: readonly InboxSegment[] = ["needs", "wait", "all"];

export function InboxSegments({ value, counts, copy, variant = "desktop", onChange }: InboxSegmentsProps) {
  return (
    <div className={variant === "mobile" ? "mx-seg" : "seg"} role="tablist" data-inbox-segments>
      {SEGMENTS.map((seg) => {
        const n = counts[seg];
        return (
          <button key={seg} type="button" role="tab" aria-selected={value === seg} className={value === seg ? "on" : ""} onClick={() => onChange(seg)}>
            {copy.inbox.segments[seg]}
            {typeof n === "number" && n > 0 ? <span className="n">{n}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export type InboxFilterKey = "mine" | "unassigned" | "unread" | "paymentIssues" | "orders" | "offers" | "appointments" | "reservations" | "tickets";

export const INBOX_FILTER_KEYS: readonly InboxFilterKey[] = ["mine", "unassigned", "unread", "paymentIssues", "orders", "offers", "appointments", "reservations", "tickets"];

export type FilterChipsProps = {
  readonly active: readonly InboxFilterKey[];
  readonly copy: KitCopy;
  /** Chips to draw; defaults to the mockup's six. */
  readonly keys?: readonly InboxFilterKey[];
  readonly variant?: "desktop" | "mobile";
  readonly onToggle: (key: InboxFilterKey) => void;
};

export function FilterChips({ active, copy, keys = ["mine", "unassigned", "unread", "paymentIssues", "orders", "offers"], variant = "desktop", onToggle }: FilterChipsProps) {
  return (
    <div className={variant === "mobile" ? "mx-chips" : "chips"} data-inbox-chips>
      {keys.map((key) => (
        <Chip key={key} soft on={active.includes(key)} onClick={() => onToggle(key)}>
          {copy.inbox.filters[key]}
        </Chip>
      ))}
    </div>
  );
}

export type FilterSheetProps = {
  readonly open: boolean;
  readonly active: readonly InboxFilterKey[];
  readonly copy: KitCopy;
  readonly keys?: readonly InboxFilterKey[];
  /** Null while the count is being worked out (busy); the Show button waits. */
  readonly resultCount: number | null;
  readonly onToggle: (key: InboxFilterKey) => void;
  readonly onClear: () => void;
  readonly onApply: () => void;
  readonly onClose: () => void;
};

export function FilterSheet({ open, active, copy, keys = INBOX_FILTER_KEYS, resultCount, onToggle, onClear, onApply, onClose }: FilterSheetProps) {
  const counting = resultCount === null;
  return (
    <Sheet
      open={open}
      variant="mobile-h60"
      title={copy.inbox.filterSheet.title}
      copy={copy}
      onClose={onClose}
      footer={
        <>
          <Btn size="lg" onClick={onClear}>
            {copy.inbox.filterSheet.clear}
          </Btn>
          <Btn size="lg" variant="primary" fill busy={counting} onClick={onApply}>
            {counting ? copy.inbox.filterSheet.counting : copy.inbox.filterSheet.show.replace("{count}", String(resultCount))}
          </Btn>
        </>
      }
    >
      {keys.map((key) => {
        const on = active.includes(key);
        return (
          <button key={key} type="button" className={`mx-opt${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggle(key)}>
            <span>{copy.inbox.filters[key]}</span>
            {on ? <Icon name="check" size={18} /> : null}
          </button>
        );
      })}
    </Sheet>
  );
}
