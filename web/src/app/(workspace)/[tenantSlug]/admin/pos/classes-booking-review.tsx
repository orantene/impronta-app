"use client";

/**
 * classes-booking-review.tsx — the last two screens of the Book door: A05
 * (review: the lines, the totals, how it is paid, Confirm) and A06 (Booked:
 * the tick, the chips, WHERE THIS NOW LIVES, Done).
 *
 * THE DESK TAKES NO DEPOSIT. `bookWalkInAppointment` books pay-in-person, so
 * the board's DEPOSIT · HOW becomes PAY · HOW with Cash the one live choice;
 * Card now, Payment link and No deposit are drawn where the board draws
 * them, disabled with their sentences (D-POS-119). Save draft and Hold 15 min
 * likewise. Nothing here is charged: cash is collected on A06 (`onCollect`,
 * the Counter's own charge) or at the visit.
 */

import type { ReactNode } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";

import { fill, formatClock, formatWhen } from "./classes-format";
import type { WalkInOutcome, WalkInService } from "./classes-panels";
import { POS_CARD, POS_EYEBROW, POS_HINT, PosAction, PosChip, PosFact, PosIcon } from "./classes-ui";

const LINE = "flex items-center gap-[12px] px-[16px] py-[13px] font-admin-body";

/** One line card row: the quantity box, the title over the person, the price. */
export function BookingLine({ service, currency, line }: { service: WalkInService; currency: string; line: string }) {
  return (
    <div className={LINE}>
      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold tabular-nums text-admin-ink">1</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-[1.2] text-admin-ink">{service.title}</span>
        <span className="mt-[2px] block text-[14.5px] leading-[1.2] text-admin-ink-muted">{line}</span>
      </span>
      <span className="text-[16.5px] font-bold tabular-nums text-admin-ink">{formatOrderMoney(service.amountCents, currency)}</span>
    </div>
  );
}

/** A05's four "how" cards: 80px, icon, title over a line; three of them disabled with the reason. */
function PayHow({ icon, title, line, selected, reason }: { icon: "card" | "link" | "cash" | "check"; title: string; line: string; selected?: boolean; reason?: string | null }) {
  const off = Boolean(reason);
  return (
    <div
      role="radio"
      aria-checked={selected ? true : false}
      aria-disabled={off || undefined}
      title={reason ?? undefined}
      data-not-wired={off ? "true" : undefined}
      className={cn(
        "flex h-[80px] items-center gap-[12px] rounded-[14px] border-[1.5px] px-[16px] font-admin-body",
        selected ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card",
        off ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      <span className="text-admin-ink">
        <PayIcon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink">{title}</span>
        <span className="block truncate text-[13px] leading-[1.3] text-admin-ink-muted">{line}</span>
      </span>
    </div>
  );
}

function PayIcon({ name }: { name: "card" | "link" | "cash" | "check" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {name === "card" ? (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </>
      ) : name === "link" ? (
        <>
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
        </>
      ) : name === "cash" ? (
        <>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <path d="M5 12l5 5L20 7" />
      )}
    </svg>
  );
}

export function ReviewStep({ service, currency, copy, children }: { service: WalkInService; currency: string; copy: ClassesCopy; children: ReactNode }) {
  const k = copy.board.booking;
  const money = formatOrderMoney(service.amountCents, currency);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.05fr]" data-pos-classes-booking-review>
      <div className="flex min-h-0 flex-col gap-[14px] overflow-y-auto border-r border-admin-border px-[24px] py-[20px]">
        <div className={cn(POS_CARD, "overflow-hidden")}>
          <BookingLine service={service} currency={currency} line={service.personName} />
          <div className="border-t border-admin-border px-[16px] py-[12px]">
            <div className="flex items-baseline justify-between gap-[12px] border-b border-admin-border-soft py-[8px] font-admin-body text-[16px] font-bold leading-[1.2] text-admin-ink">
              <span>{k.total}</span>
              <span className="tabular-nums">{money}</span>
            </div>
            <PosFact label={k.deposit} muted>
              {k.depositNone}
            </PosFact>
            <PosFact label={k.balanceRow}>{money}</PosFact>
            <PosFact label={k.cancelFreeRow} muted>
              {k.cancelFreeNone}
            </PosFact>
          </div>
        </div>
        <div className="flex items-start gap-[10px] rounded-[12px] bg-admin-indigo-soft px-[14px] py-[12px] font-admin-body text-[14px] font-medium leading-[1.45] text-admin-indigo">
          <span className="mt-[2px] shrink-0">
            <PayIcon name="check" />
          </span>
          <span>{fill(k.reviewNote, { name: service.personName })}</span>
        </div>
        <div className="grid grid-cols-2 gap-[10px]">
          <PosAction reason={k.saveDraftOff}>{k.saveDraft}</PosAction>
          <PosAction reason={k.holdOff}>{k.hold}</PosAction>
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-[14px] bg-admin-surface px-[24px] py-[20px]">
        <span className={POS_EYEBROW}>{k.payHow}</span>
        <div className="grid grid-cols-2 gap-[10px]" role="radiogroup" aria-label={k.payHow}>
          <PayHow icon="card" title={k.cardNow} line={k.cardNowOff} reason={k.cardNowOff} />
          <PayHow icon="link" title={k.paymentLink} line={k.paymentLinkOff} reason={k.paymentLinkOff} />
          <PayHow icon="cash" title={k.cash} line={k.cashLine} selected />
          <PayHow icon="check" title={k.noDeposit} line={k.noDepositOff} reason={k.noDepositOff} />
        </div>
        <div className="flex-1" />
        {children}
        <p className={cn("m-0 text-center", POS_HINT)}>{fill(k.confirmFootnote, { name: service.personName })}</p>
      </div>
    </div>
  );
}

export function Confirmed({
  outcome,
  service,
  slotIso,
  name,
  venueName,
  timeZone,
  locale,
  copy,
  busy,
  onCollect,
  onStartAgain,
  onClose,
}: {
  outcome: WalkInOutcome;
  service: WalkInService | null;
  slotIso: string;
  name: string;
  venueName: string;
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  onCollect: () => void;
  onStartAgain: () => void;
  onClose: () => void;
}) {
  const k = copy.board.booking;
  const due = outcome.stage === "booked" ? outcome.outstandingCents : 0;
  const money = outcome.stage === "booked" ? formatOrderMoney(outcome.outstandingCents, outcome.currency) : null;
  const when = slotIso ? formatWhen(slotIso, timeZone, locale) : "";
  const clock = slotIso ? formatClock(slotIso, timeZone, locale) : "";
  const customer = name.trim() || copy.today.nobody;
  const person = service?.personName ?? "";
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]" data-pos-classes-booking-flow="confirmed">
      <div className="flex flex-col items-center justify-center gap-[14px] border-r border-admin-border px-[26px] py-[26px] text-center">
        <span className="flex h-[96px] w-[96px] items-center justify-center rounded-full bg-admin-success-soft text-admin-green">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
        <div className="font-admin-body text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-admin-ink">{fill(k.bookedTitle, { when })}</div>
        <div className="font-admin-body text-[16px] leading-[1.3] text-admin-ink-muted">
          {fill(k.bookedLine, { name: person, venue: venueName, pay: due > 0 && money ? fill(k.payDue, { amount: money }) : k.payNothing })}
        </div>
        <div className="flex flex-wrap justify-center gap-[8px]">
          <PosChip tone="green" size="sm">
            {k.chipConfirmed}
          </PosChip>
          <PosChip tone={due > 0 ? "coral" : "slate"} size="sm">
            {due > 0 ? k.chipUnpaid : k.chipPaid}
          </PosChip>
        </div>
        <div className="sr-only" data-pos-classes-notice="done">
          {outcome.sentence}
        </div>
        <div className="mt-[6px] grid w-full max-w-[520px] grid-cols-2 gap-[10px]">
          <PosAction reason={k.confirmationOff}>
            <PosIcon name="person" size={16} />
            {k.confirmSms}
          </PosAction>
          <PosAction reason={k.confirmationOff}>{k.alsoEmail}</PosAction>
        </div>
        <div className="mt-[2px] flex w-full max-w-[520px] flex-col gap-[10px]">
          {due > 0 && outcome.stage === "booked" ? (
            <PosAction tone="primary" size="lg" className="w-full" disabled={busy} onClick={onCollect} testAttr={{ "data-pos-classes-collect": "collect" }}>
              {busy ? copy.walkin.collecting : fill(k.collectNow, { amount: money ?? "" })}
            </PosAction>
          ) : null}
          <PosAction tone={due > 0 ? "secondary" : "primary"} size="lg" className="w-full" onClick={onClose}>
            {k.done}
          </PosAction>
          <PosAction onClick={onStartAgain} className="w-full">
            {k.another}
          </PosAction>
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-[12px] bg-admin-surface p-[26px]">
        <span className={POS_EYEBROW}>{k.lives}</span>
        <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
          <PosFact label={k.livesCalendar}>{slotIso ? fill(k.livesCalendarValue, { time: clock }) : "—"}</PosFact>
          <PosFact label={k.livesSales}>{due > 0 && money ? fill(k.livesSalesValue, { amount: money }) : k.livesSalesNone}</PosFact>
          <PosFact label={fill(k.livesRecord, { name: customer })}>{k.livesRecordValue}</PosFact>
          <PosFact label={fill(k.livesPersonToday, { name: person })}>{fill(k.livesPersonTodayValue, { time: clock, customer })}</PosFact>
        </div>
        <div className="flex items-start gap-[10px] rounded-[12px] bg-admin-indigo-soft px-[14px] py-[12px] font-admin-body text-[14px] font-medium leading-[1.45] text-admin-indigo">
          <span className="mt-[2px] shrink-0 -rotate-90">
            <PosIcon name="chevron" size={14} />
          </span>
          <span>{k.livesNote}</span>
        </div>
        <span className={POS_HINT}>{k.confirmationOff}</span>
      </div>
    </div>
  );
}
