"use client";

/**
 * door-ui.tsx — the pieces the Door boards share: the 13.5px status pill,
 * the ticket row with its state, the order card (G08, E09), the key/value
 * fact row (G08, E07, E12) and the small note box.
 *
 * Every state a ticket can be in is decided ONCE here (`ticketState`) from
 * the row the reader returned, so the gate's lookup column, the box office's
 * Recent card and the lookup screen never disagree about one ticket. Token
 * classes only.
 */

import type { ReactNode } from "react";

import { POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { cn } from "@/lib/utils";
import { interpolate } from "@/i18n/interpolate";
import type { DoorRow } from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";
import { ticketRef } from "@/lib/pos/door-model";

import type { DoorCopy } from "./door-copy";

export type PillTone = "green" | "slate" | "red" | "coral" | "indigo";

const PILL_TONE: Record<PillTone, string> = {
  green: "bg-admin-success-soft text-admin-success",
  slate: "bg-admin-amber-soft text-admin-amber",
  red: "bg-admin-critical-soft text-admin-red",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
};

export function Pill({ tone, children, className, state }: { tone: PillTone; children: ReactNode; className?: string; state?: string }) {
  return (
    <span
      data-state={state}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-[5px] text-[13.5px] font-semibold", PILL_TONE[tone], className)}
    >
      {children}
    </span>
  );
}

export type TicketState = {
  readonly key: "admitted" | "partial" | "valid" | "validUnnamed" | "refunded" | "cancelled" | "noShow";
  readonly label: string;
  readonly tone: PillTone;
  /** True when a tap can still admit someone on this row. */
  readonly admittable: boolean;
};

/** One ticket's state, from the row and nothing else. */
export function ticketState(row: DoorRow, copy: DoorCopy["lookup"], timeOf: (iso: string) => string): TicketState {
  if (row.status === "refunded") return { key: "refunded", label: copy.refunded, tone: "red", admittable: false };
  if (row.status !== "valid") return { key: "cancelled", label: copy.cancelled, tone: "red", admittable: false };
  if (row.admittedCount >= row.partySize) {
    return { key: "admitted", label: row.seatedAt ? interpolate(copy.admittedAt, { time: timeOf(row.seatedAt) }) : copy.admitted, tone: "green", admittable: false };
  }
  if (row.admittedCount > 0) {
    return { key: "partial", label: interpolate(copy.partial, { admitted: row.admittedCount, party: row.partySize }), tone: "coral", admittable: true };
  }
  if (row.noShowAt) return { key: "noShow", label: copy.noShow, tone: "coral", admittable: true };
  if (!row.holderName) return { key: "validUnnamed", label: copy.validNameAtDoor, tone: "indigo", admittable: true };
  return { key: "valid", label: copy.valid, tone: "indigo", admittable: true };
}

/** The name a row is listed under: the holder, else the walk-up or party label. */
export function rowName(row: DoorRow, copy: DoorCopy["lookup"]): string {
  if (row.holderName) return row.holderName;
  if (row.walkUp) return copy.walkUp;
  if (row.partySize > 1) return interpolate(copy.party, { size: row.partySize });
  return copy.unnamed;
}

export function rowRef(row: DoorRow): string {
  return ticketRef(row.orderId, row.lineSeq, row.id);
}

/** G08's ticket row inside the order card: name, second line, the pill, an optional action. */
export function TicketRow({
  row,
  copy,
  timeOf,
  action,
  compact,
}: {
  row: DoorRow;
  copy: DoorCopy["lookup"];
  timeOf: (iso: string) => string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const state = ticketState(row, copy, timeOf);
  const second = [row.tierLabel ?? copy.ticket, state.key === "admitted" && row.seatedAt ? state.label : null].filter(Boolean).join(" · ");
  return (
    <div data-door-row={row.id} data-door-row-state={state.key} className={cn("flex items-center gap-3 border-t border-admin-border-soft", compact ? "py-2.5" : "py-3")}>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[15px] font-semibold", state.admittable || state.key === "admitted" ? "text-admin-ink" : "text-admin-ink-muted")}>{rowName(row, copy)}</div>
        <div className="truncate text-[13px] text-admin-ink-muted">
          <span className="font-mono text-[12px]">{rowRef(row)}</span> · {second}
        </div>
      </div>
      <Pill tone={state.tone} state={state.key}>
        {state.label}
      </Pill>
      {action}
    </div>
  );
}

/** A key/value row in a white card (G08 Right · Entrance · Counts · After). */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-admin-border-soft py-2 text-[15px] last:border-b-0">
      <span className="shrink-0 text-admin-ink-muted">{label}</span>
      <span className="text-right font-semibold tabular-nums text-admin-ink">{children}</span>
    </div>
  );
}

export function FactCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(POS_SURFACE, "border-[1px] p-4", className)}>{children}</div>;
}

/** The slate note under a column ("Look up is not admit ..."). */
export function DoorNote({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[12px] px-3.5 py-3 text-[14px] font-medium leading-[1.45]",
        tone === "indigo" ? "bg-admin-indigo-soft text-admin-indigo" : "bg-admin-amber-soft text-admin-amber",
      )}
    >
      <span aria-hidden className="mt-[3px] inline-block h-[14px] w-[14px] shrink-0 rounded-full border-[1.5px] border-current" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** A labelled field drawn disabled with its reason (G08 Reason, Authorized by). */
export function DisabledField({ label, value, reason, chevron }: { label: string; value: string; reason: string; chevron?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" title={reason} data-not-wired="true">
      <div className="text-[14px] font-semibold text-admin-ink-muted">{label}</div>
      <div className="flex h-[52px] cursor-not-allowed items-center gap-2 rounded-[12px] border-[1.5px] border-admin-border bg-admin-surface-alt px-3.5 text-[16px] text-admin-ink-dim">
        <span className="flex-1 truncate">{value}</span>
        {chevron ? <span aria-hidden className="text-admin-ink-dim">⌄</span> : null}
      </div>
      <p className="m-0 text-[12.5px] text-admin-ink-dim">{reason}</p>
    </div>
  );
}
