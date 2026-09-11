"use client";

/**
 * TablePopover — T04 "Tap a table" (`POSTableActions`): the 320px card that
 * opens beside the tapped tile. Header: the code, the state pill, one line
 * (who · how many · the server · what is unpaid), chips for what the kitchen
 * is doing. Then ONE primary action for the table's state and the menu of
 * next moves. A move the engine has no writer for is drawn disabled over its
 * one sentence (change server, extend time, block, split).
 */

import { ArrowRight, Check, Clock, CreditCard, Ellipsis, Flame, Plus, ShoppingBag, User, X } from "lucide-react";
import { useEffect, useRef, type ComponentType } from "react";
import type { LucideProps } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_PILL, POS_PILL_CORAL, POS_PILL_INDIGO, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";

import type { FloorBoardCopy } from "./floor-copy";
import { seatedEntryFor, tableCode, tableLabel, tableTone, type FloorTicket } from "./floor-model";
import { FLOOR_PILL, PILL_TONE } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";
import { moneyFor } from "./FloorViews";

export type TablePopoverProps = {
  readonly table: FloorTable;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  /** Where the tile was, in viewport pixels; null centres the card. */
  readonly anchor: DOMRect | null;
  /** The floor area the card must stay inside. */
  readonly bounds: DOMRect | null;
  readonly busy: boolean;
  readonly checkHref: (orderId: string) => string;
  readonly hasKitchen: boolean;
  readonly onClose: () => void;
  readonly onSeat: () => void;
  readonly onMoveOrJoin: () => void;
  readonly onPartyLeft: () => void;
  readonly onReset: () => void;
  readonly onSendKitchen: () => void;
  readonly onFireCourse?: (courseSeq: number) => void;
};

const WIDTH = 320;

function place(anchor: DOMRect | null, bounds: DOMRect | null): { left: number; top: number } {
  if (!anchor || !bounds) return { left: 24, top: 24 };
  const gap = 8;
  let left = anchor.right + gap - bounds.left;
  if (left + WIDTH > bounds.width - 8) left = Math.max(8, anchor.left - bounds.left - WIDTH - gap);
  let top = anchor.top - bounds.top - 8;
  const maxTop = Math.max(8, bounds.height - 600);
  if (top > maxTop) top = maxTop;
  return { left, top: Math.max(8, top) };
}

function kitchenChip(copy: FloorBoardCopy, ticket: FloorTicket | undefined): string {
  const p = copy.popover;
  if (!ticket) return p.kitchenNone;
  const key = ticket.status === "ready" ? p.kitchenReady : ticket.status === "acknowledged" ? p.kitchenAcknowledged : p.kitchenQueued;
  return interpolate(key, { n: ticket.revision });
}

type RowProps = {
  readonly icon: ComponentType<LucideProps>;
  readonly label: string;
  readonly reason?: string;
  readonly onSelect?: () => void;
  readonly busy: boolean;
  readonly testId: string;
};

function MenuRow({ icon: Icon, label, reason, onSelect, busy, testId }: RowProps) {
  const disabled = busy || !onSelect;
  return (
    <li>
      <button
        type="button"
        data-floor-action={testId}
        disabled={disabled}
        title={reason}
        aria-describedby={reason ? `${testId}-reason` : undefined}
        onClick={onSelect}
        className="flex min-h-[46px] w-full items-center gap-3 rounded-[10px] px-2 text-left text-[15px] font-semibold text-admin-ink transition-colors hover:bg-admin-surface-alt disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Icon aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-admin-ink-muted" />
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {reason && (
            <span id={`${testId}-reason`} className="block text-[12.5px] font-normal leading-[1.3] text-admin-ink-muted">
              {reason}
            </span>
          )}
        </span>
        {onSelect && <ArrowRight aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-admin-ink-dim" />}
      </button>
    </li>
  );
}

export function TablePopover(props: TablePopoverProps) {
  const { table, data, copy, busy } = props;
  const p = copy.popover;
  const ref = useRef<HTMLDivElement | null>(null);
  const code = tableCode(table);
  const label = tableLabel(table, data.tables);
  const tone = tableTone(table);
  const occupied = table.state === "occupied";
  const entry = seatedEntryFor(table, data.book);
  const pos = place(props.anchor, props.bounds);

  const onClose = props.onClose;
  useEffect(() => {
    ref.current?.focus();
  }, [table.spaceId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pill = occupied
    ? interpolate(p.seatedFor, { n: table.elapsedMinutes ?? 0 })
    : table.blocked
      ? p.blockedPill
      : table.state === "held"
        ? p.heldPill
        : table.needsResetSinceIso
          ? p.needsResetPill
          : interpolate(p.freeSeats, { min: table.partyMin, max: table.partyMax });

  const partySize = table.partySize ?? entry?.partySize ?? null;
  const who = occupied
    ? [entry?.holderName ?? copy.panel.walkIn, partySize == null ? null : interpolate(p.guests, { n: partySize }), copy.list.serverNone]
        .filter((x): x is string => Boolean(x))
        .join(" · ")
    : table.held
      ? `${table.held.holderName ?? copy.panel.walkIn} · ${interpolate(p.guests, { n: table.held.partySize })}`
      : table.needsResetSinceIso
        ? interpolate(copy.tile.vacated, { time: venueHhmm(table.needsResetSinceIso, data.timeZone, data.locale) })
        : "";

  const unpaid = occupied && table.orderId ? interpolate(p.unpaid, { amount: moneyFor(table, data) }) : occupied ? p.noCheck : "";
  const ticket = table.orderId ? data.tickets[table.orderId] : undefined;
  const joined = table.joinedWithSpaceId ?? table.joinedFromSpaceId;
  const joinedCode = joined ? (data.tables.find((t) => t.spaceId === joined)?.code ?? "") : "";

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={label}
      data-floor-sheet={code}
      className="absolute z-20 flex max-h-[calc(100%-16px)] w-[320px] flex-col gap-2 overflow-y-auto rounded-[18px] bg-admin-card p-3.5 shadow-admin-hover outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[19px] font-semibold tracking-[-0.01em] text-admin-ink">{label}</strong>
            <span className={cn(FLOOR_PILL, PILL_TONE[tone])}>{pill}</span>
          </div>
          {(who || unpaid) && (
            <p className="m-0 mt-1 text-[14px] text-admin-ink-muted">
              {who}
              {who && unpaid ? " · " : ""}
              {unpaid && <strong className="text-admin-ink">{unpaid}</strong>}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {occupied && (
              <span className={cn(POS_PILL, ticket ? POS_PILL_INDIGO : "bg-admin-surface-alt text-admin-ink-muted")} data-floor-kitchen>
                {kitchenChip(copy, ticket)}
              </span>
            )}
            {occupied && table.serviceKind === "tab" && <span className={cn(POS_PILL, POS_PILL_CORAL)}>{copy.tile.tabCheck}</span>}
            {joinedCode && (
              <span className={cn(POS_PILL, "bg-admin-surface-alt text-admin-ink-muted")}>
                {interpolate(copy.tile.joinedWith, { code: joinedCode })}
              </span>
            )}
            {occupied && partySize != null && (
              <span className={cn(POS_PILL, "bg-admin-surface-alt text-admin-ink-muted")} data-floor-party-size>
                {interpolate(copy.tile.partyOf, { n: partySize })}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label={p.close}
          onClick={props.onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-admin-ink-muted hover:bg-admin-surface-alt"
        >
          <X aria-hidden size={16} strokeWidth={1.75} />
        </button>
      </div>

      {occupied ? (
        <>
          {table.orderId ? (
            <>
              <a href={props.checkHref(table.orderId)} data-floor-open-order className={cn(POS_PRIMARY_ACTION, "h-12 w-full text-[16px]")}>
                <ShoppingBag aria-hidden size={18} strokeWidth={1.75} />
                {p.openOrder}
              </a>
              <div className="grid grid-cols-2 gap-2">
                <a href={props.checkHref(table.orderId)} className={cn(POS_SECONDARY_ACTION, "min-w-0 px-3")}>
                  <Plus aria-hidden size={18} strokeWidth={1.75} />
                  {p.addItems}
                </a>
                <a href={props.checkHref(table.orderId)} className={cn(POS_SECONDARY_ACTION, "min-w-0 px-3")}>
                  <CreditCard aria-hidden size={18} strokeWidth={1.75} />
                  {interpolate(p.collect, { amount: moneyFor(table, data) })}
                </a>
              </div>
            </>
          ) : null}
          <ul className="m-0 flex list-none flex-col p-0">
            {props.hasKitchen && table.orderId && (
              <MenuRow icon={Flame} label={p.sendKitchen} onSelect={props.onSendKitchen} busy={busy} testId="send-kitchen" />
            )}
            {props.onFireCourse && table.visitId && (
              <>
                <MenuRow icon={Flame} label={p.fireStarters} onSelect={() => props.onFireCourse?.(1)} busy={busy} testId="fire-course-1" />
                <MenuRow icon={Flame} label={p.fireMains} onSelect={() => props.onFireCourse?.(2)} busy={busy} testId="fire-course-2" />
                <MenuRow icon={Flame} label={p.fireDessert} onSelect={() => props.onFireCourse?.(3)} busy={busy} testId="fire-course-3" />
              </>
            )}
            <MenuRow icon={ArrowRight} label={p.moveOrJoin} onSelect={joined ? undefined : props.onMoveOrJoin} reason={joined ? copy.refusal.joined_visit : undefined} busy={busy} testId="move-or-join" />
            <MenuRow icon={User} label={`${p.changeServer} · ${copy.list.serverNone}`} reason={p.changeServerReason} busy={busy} testId="change-server" />
            <MenuRow icon={Clock} label={p.extendTime} reason={p.extendTimeReason} busy={busy} testId="extend-time" />
            <MenuRow icon={Check} label={p.partyLeft} onSelect={props.onPartyLeft} busy={busy} testId="party-left" />
            <MenuRow icon={Ellipsis} label={p.split} reason={p.splitReason} busy={busy} testId="split" />
          </ul>
        </>
      ) : (
        <>
          {!table.blocked && (
            <button type="button" data-floor-seat disabled={busy} onClick={props.onSeat} className={cn(POS_PRIMARY_ACTION, "h-12 w-full text-[16px]")}>
              <User aria-hidden size={18} strokeWidth={1.75} />
              {p.seatParty}
            </button>
          )}
          <ul className="m-0 flex list-none flex-col p-0">
            {table.needsResetSinceIso && (
              <MenuRow icon={Check} label={p.markReady} onSelect={props.onReset} busy={busy} testId="mark-ready" />
            )}
            <MenuRow icon={Ellipsis} label={p.block} reason={p.blockReason} busy={busy} testId="block" />
          </ul>
        </>
      )}
    </div>
  );
}
