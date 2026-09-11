"use client";

/**
 * classes-today.tsx — the Front desk's Today screen as board B01 draws it:
 * the day's list on the left (Today / Due / Done, Appts | Classes), the
 * selected appointment on the right (BOOKED and ADDED TODAY lines from the
 * sale, the totals card, Collect), and the Add-extra sheet (B02).
 *
 * The list row is `[data-pos-classes-appointment]` and the detail pane is
 * `[data-pos-classes-detail]`, both keyed by the booking id, so a journey
 * selects a row and acts in the pane. The row's pill carries
 * `data-pos-classes-state`, which is what the stale-screen refusal turns on:
 * "Check in" sends the state the OPERATOR SAW.
 *
 * WIRED: Check in, Collect (the Counter's cash charge), Move it (the proven
 * reschedule), Add service / Product (the Counter's `posAddLine` on the
 * appointment's own sale, version carried). NOT WIRED, said on the control
 * (D-POS-19): Use a pass, Who did what, Send payment link, Rebook.
 */

import { useState } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesAppointment, ClassesAppointmentState, ClassesSession } from "@/lib/pos/classes/day";
import type { ClassesExtra } from "@/lib/pos/classes/extras";
import type { PosSaleView } from "@/lib/pos/commands";
import { cn } from "@/lib/utils";

import { fill, formatClock } from "./classes-format";
import { POS_BTN_PRIMARY, POS_CARD, POS_FIELD, PosAction, PosFact, PosPill, PosSegmented, PosSheet, type PosPillTone } from "./classes-ui";

export type TodayTab = "today" | "due" | "done";
export type TodaySegment = "appts" | "classes";

export type SaleDetail = { status: "idle" } | { status: "loading" } | { status: "ready"; sale: PosSaleView } | { status: "unreadable" };

const STATE_TONE: Record<ClassesAppointmentState, PosPillTone> = {
  draft: "slate",
  tentative: "indigo",
  confirmed: "green",
  in_progress: "royal",
  completed: "slate",
  cancelled: "critical",
  archived: "slate",
  unknown: "coral",
};

export function todayRows(rows: readonly ClassesAppointment[], tab: TodayTab): ClassesAppointment[] {
  if (tab === "due") return rows.filter((r) => r.orderId !== null && r.outstandingCents > 0 && r.state !== "cancelled");
  if (tab === "done") return rows.filter((r) => r.state === "completed" || r.state === "in_progress");
  return rows.filter((r) => r.state !== "cancelled" && r.state !== "archived");
}

/* ── The list ──────────────────────────────────────────────────────────── */

export function TodayList({
  rows,
  sessions,
  tab,
  segment,
  selectedId,
  selectedSessionId,
  timeZone,
  locale,
  copy,
  onTab,
  onSegment,
  onSelect,
  onSelectSession,
  onWalkIn,
  onBook,
}: {
  rows: readonly ClassesAppointment[];
  sessions: readonly ClassesSession[];
  tab: TodayTab;
  segment: TodaySegment;
  selectedId: string | null;
  selectedSessionId: string | null;
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  onTab: (tab: TodayTab) => void;
  onSegment: (segment: TodaySegment) => void;
  onSelect: (row: ClassesAppointment) => void;
  onSelectSession: (session: ClassesSession) => void;
  onWalkIn: () => void;
  onBook: () => void;
}) {
  const b = copy.board;
  const due = todayRows(rows, "due").length;
  const done = todayRows(rows, "done").length;
  const visible = todayRows(rows, tab);
  return (
    <div className="flex h-full min-h-0 w-[340px] shrink-0 flex-col border-r border-admin-border bg-admin-card">
      <div className="flex items-center justify-between gap-[6px] px-[12px] py-[12px]">
        <PosSegmented<TodayTab>
          label={copy.today.heading}
          value={tab}
          onChange={onTab}
          size="sm"
          options={[
            { id: "today", label: b.list.tabToday },
            { id: "due", label: `${b.list.tabDue} ${due}` },
            { id: "done", label: `${b.list.tabDone} ${done}` },
          ]}
        />
        <PosSegmented<TodaySegment>
          label={b.list.segAppts}
          value={segment}
          onChange={onSegment}
          size="sm"
          options={[
            { id: "appts", label: b.list.segAppts },
            { id: "classes", label: b.list.segClasses },
          ]}
        />
      </div>
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
        {segment === "classes" ? (
          sessions.length === 0 ? (
            <li className="px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{copy.sessions.empty}</li>
          ) : (
            sessions.map((session) => {
              const seats = session.seats;
              const full = seats.kind === "counted" && seats.remaining <= 0;
              const here = session.roster.filter((r) => r.kind === "admission" && r.admittedCount > 0).length;
              return (
                <li
                  key={session.id}
                  data-pos-classes-session={session.id}
                  aria-selected={session.id === selectedSessionId}
                  className={cn(
                    "grid cursor-pointer grid-cols-[64px_1fr_auto] items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[12px] font-admin-body",
                    session.id === selectedSessionId ? "bg-admin-brand-soft" : "hover:bg-admin-surface",
                  )}
                  onClick={() => onSelectSession(session)}
                >
                  <span className="font-mono text-[15px] text-admin-ink-muted">{formatClock(session.startsAt, timeZone, locale)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-admin-ink">
                      {session.title}
                      {seats.kind === "counted" ? ` · ${seats.total - seats.remaining}/${seats.total}` : ""}
                    </span>
                    <span className="block truncate text-[13px] text-admin-ink-muted" data-pos-classes-seats>
                      {seatsSentence(session, copy)}
                      {here > 0 ? ` · ${fill(b.list.here, { here })}` : ""}
                    </span>
                  </span>
                  <PosPill tone={full ? "slate" : "royal"}>{full ? b.list.full : b.list.classChip}</PosPill>
                </li>
              );
            })
          )
        ) : visible.length === 0 ? (
          <li className="px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">
            {tab === "due" ? b.list.emptyDue : tab === "done" ? b.list.emptyDone : copy.today.empty}
          </li>
        ) : (
          visible.map((row) => (
            <li
              key={row.id}
              data-pos-classes-appointment={row.id}
              aria-selected={row.id === selectedId}
              className={cn(
                "grid cursor-pointer grid-cols-[64px_1fr_auto] items-center gap-[10px] border-t border-admin-border-soft px-[16px] py-[12px] font-admin-body",
                row.id === selectedId ? "bg-admin-brand-soft" : "hover:bg-admin-surface",
              )}
              onClick={() => onSelect(row)}
            >
              <span className="font-mono text-[15px] text-admin-ink-muted">{formatClock(row.startsAt, timeZone, locale)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-admin-ink">{row.customerName ?? copy.today.nobody}</span>
                <span className="block truncate text-[13px] text-admin-ink-muted">{row.title}</span>
              </span>
              <PosPill tone={STATE_TONE[row.state]} attrs={{ "data-pos-classes-state": row.state }}>
                {row.state === "in_progress" ? copy.today.arrived : copy.state[row.state]}
                {row.orderId && row.outstandingCents > 0 && row.state !== "cancelled" ? ` · ${formatOrderMoney(row.outstandingCents, row.currency)}` : ""}
              </PosPill>
            </li>
          ))
        )}
      </ul>
      <div className="grid grid-cols-2 gap-[10px] border-t border-admin-border px-[16px] py-[12px]">
        <PosAction tone="outline" onClick={onWalkIn} testAttr={{ "data-pos-classes-walkin": "open" }}>
          + {b.list.walkIn}
        </PosAction>
        <PosAction onClick={onBook} testAttr={{ "data-pos-classes-book-open": "open" }}>
          {b.list.book}
        </PosAction>
      </div>
    </div>
  );
}

export function seatsSentence(session: ClassesSession, copy: ClassesCopy): string {
  const seats = session.seats;
  if (seats.kind === "counted") {
    const line = fill(copy.sessions.seats, { taken: seats.total - seats.remaining, total: seats.total });
    return seats.remaining <= 0 ? `${line} · ${copy.sessions.seatsFull}` : line;
  }
  if (seats.kind === "unreadable") return copy.sessions.seatsUnknown;
  return copy.sessions.seatsUncounted;
}

/* ── The detail pane ───────────────────────────────────────────────────── */

export function AppointmentDetail({
  row,
  sale,
  timeZone,
  locale,
  copy,
  busy,
  moving,
  moveValue,
  onMoveValueChange,
  onCheckIn,
  onOpenMove,
  onSubmitMove,
  onCancelMove,
  onCollect,
  onAddExtra,
  onSendLink,
}: {
  row: ClassesAppointment;
  sale: SaleDetail;
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  moving: boolean;
  moveValue: string;
  onMoveValueChange: (value: string) => void;
  onCheckIn: (row: ClassesAppointment) => void;
  onOpenMove: (row: ClassesAppointment) => void;
  onSubmitMove: (row: ClassesAppointment) => void;
  onCancelMove: () => void;
  onCollect: (row: ClassesAppointment) => void;
  onAddExtra: () => void;
  /** B01's `Send payment link`; absent where the surface cannot mint one. */
  onSendLink?: (row: ClassesAppointment) => void;
}) {
  const b = copy.board;
  const arrived = row.state === "in_progress";
  const canCheckIn = row.state === "confirmed" || row.state === "tentative" || row.state === "draft";
  const canMove = canCheckIn || arrived;
  const ready = sale.status === "ready" ? sale.sale : null;
  const services = ready ? ready.lines.filter((l) => l.sessionId === null).reduce((n, l) => n + l.totalCents, 0) : null;
  const paid = ready ? ready.depositPaidCents : null;
  const when = `${formatClock(row.startsAt, timeZone, locale)}${row.endsAt ? `–${formatClock(row.endsAt, timeZone, locale)}` : ""}`;
  // B03: sales linked to this booking for payment (`order_lines.booking_id`).
  const linkedOwed = row.linkedSales.reduce((n, sale) => n + sale.outstandingCents, 0);
  const balanceDue = row.outstandingCents + linkedOwed;

  return (
    <div data-pos-classes-detail={row.id} className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-[16px]">
      <div className="flex flex-wrap items-start justify-between gap-[10px]">
        <div className="flex items-center gap-[12px]">
          <span className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-admin-indigo-soft font-admin-body text-[15px] font-bold text-admin-indigo">
            {initials(row.customerName ?? "")}
          </span>
          <div>
            <div className="font-admin-body text-[22px] font-semibold leading-[1.15] text-admin-ink">
              {row.customerName ?? copy.today.nobody} · {when}
            </div>
            <div className="font-admin-body text-[14px] text-admin-ink-muted">{row.title}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-[6px]">
          {row.linkedSales.length > 0 ? (
            <PosPill tone="slate">{fill(b.detail.linkedChip, { reference: row.linkedSales.map((s) => s.reference).join(", ") })}</PosPill>
          ) : null}
          {arrived ? <PosPill tone="royal">{b.detail.checkedIn}</PosPill> : null}
          {row.state === "completed" ? <PosPill tone="green">{b.detail.serviceDone}</PosPill> : null}
          {row.orderId && row.outstandingCents <= 0 ? <PosPill tone="slate">{b.detail.paidChip}</PosPill> : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px] gap-[14px]">
        {/* The sale's lines */}
        <div className={cn(POS_CARD, "flex flex-col overflow-hidden")}>
          <div className="bg-admin-surface px-[16px] py-[8px] font-admin-body text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{b.detail.booked}</div>
          {sale.status === "loading" ? (
            <p className="m-0 px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{b.detail.linesLoading}</p>
          ) : sale.status === "unreadable" ? (
            <p role="alert" className="m-0 px-[16px] py-[14px] font-admin-body text-[14px] text-admin-red">{b.detail.linesUnreadable}</p>
          ) : !ready || ready.lines.length === 0 ? (
            <p className="m-0 px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{b.detail.noLines}</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-admin-border-soft p-0">
              {ready.lines.map((line) => (
                <li key={line.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto_auto] items-center gap-[10px] px-[14px] py-[10px] font-admin-body">
                  <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-semibold text-admin-ink">{line.units}</span>
                  <span className="min-w-0">
                    <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink [overflow-wrap:anywhere]">{line.label}</span>
                  </span>
                  <PosPill tone={arrived || row.state === "completed" ? "green" : "slate"}>{row.state === "completed" ? b.detail.lineDone : b.detail.booked}</PosPill>
                  <span className="text-[17px] font-semibold tabular-nums text-admin-ink">{formatOrderMoney(line.totalCents, ready.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          {row.linkedSales.map((linked) => (
            <div key={linked.orderId} data-pos-classes-linked-sale={linked.orderId}>
              <div className="bg-admin-surface px-[16px] py-[8px] font-admin-body text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">
                {fill(b.detail.linkedFrom, { reference: linked.reference })}
              </div>
              <ul className="m-0 list-none divide-y divide-admin-border-soft p-0">
                {linked.lines.map((line) => (
                  <li key={line.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto_auto] items-center gap-[10px] px-[14px] py-[10px] font-admin-body">
                    <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-semibold text-admin-ink">{line.units}</span>
                    <span className="min-w-0">
                      <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink [overflow-wrap:anywhere]">{line.label}</span>
                      <span className="block text-[13px] text-admin-ink-muted">{fill(b.detail.fromSale, { reference: linked.reference })}</span>
                    </span>
                    <PosPill tone="indigo">{b.detail.linkedPayment}</PosPill>
                    <span className="text-[17px] font-semibold tabular-nums text-admin-ink">{formatOrderMoney(line.totalCents, linked.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-auto flex flex-wrap gap-[10px] border-t border-admin-border-soft px-[16px] py-[12px]">
            <PosAction tone="outline" reason={row.orderId ? null : b.detail.addOff} onClick={onAddExtra} testAttr={{ "data-pos-classes-add-extra": "open" }}>
              + {b.detail.addService}
            </PosAction>
            <PosAction reason={row.orderId ? null : b.detail.addOff} onClick={onAddExtra}>
              {b.detail.product}
            </PosAction>
            <PosAction reason={b.detail.usePassOff}>{b.detail.usePass}</PosAction>
          </div>
        </div>

        {/* Totals, who did what, the actions */}
        <div className="flex flex-col gap-[14px]">
          <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
            <PosFact label={b.detail.services}>{services === null ? "…" : formatOrderMoney(services, ready?.currency ?? row.currency)}</PosFact>
            {row.linkedSales.map((linked) => (
              <PosFact key={linked.orderId} label={fill(b.detail.linkedSale, { reference: linked.reference })}>
                {formatOrderMoney(linked.outstandingCents, linked.currency)}
              </PosFact>
            ))}
            <PosFact label={b.detail.depositPaid}>{paid === null ? "…" : `−${formatOrderMoney(paid, ready?.currency ?? row.currency)}`}</PosFact>
            <div className="flex items-baseline justify-between gap-[12px] py-[10px] font-admin-body">
              <span className="text-[17px] font-bold text-admin-ink">{b.detail.balanceDue}</span>
              <span className="text-[30px] font-bold tabular-nums text-admin-ink" data-pos-classes-balance-due>
                {row.orderId || row.linkedSales.length > 0 ? formatOrderMoney(balanceDue, row.currency) : "—"}
              </span>
            </div>
          </div>
          <div className={cn(POS_CARD, "px-[16px] py-[12px]")} title={b.detail.whoDidWhatOff}>
            <div className="font-admin-body text-[12px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{b.detail.whoDidWhat}</div>
            <p className="m-0 mt-[4px] font-admin-body text-[13px] text-admin-ink-dim">{b.detail.whoDidWhatOff}</p>
          </div>

          <div className="mt-auto flex flex-col gap-[10px]">
            {canCheckIn ? (
              <PosAction tone="primary" disabled={busy} className="h-[56px] text-[17px]" onClick={() => onCheckIn(row)}>
                {busy ? copy.today.checkingIn : copy.today.checkIn}
              </PosAction>
            ) : null}
            {row.orderId && row.collectable && row.outstandingCents > 0 ? (
              <PosAction tone="primary" disabled={busy} className="h-[56px] text-[17px]" onClick={() => onCollect(row)}>
                {fill(copy.today.collect, { amount: formatOrderMoney(row.outstandingCents, row.currency) })}
              </PosAction>
            ) : null}
            <div className="grid grid-cols-2 gap-[10px]">
              <PosAction
                reason={onSendLink && row.orderId && row.collectable && row.outstandingCents > 0 ? null : b.detail.sendLinkOff}
                className="px-[8px] text-[13px]"
                onClick={onSendLink ? () => onSendLink(row) : undefined}
                testAttr={{ "data-pos-classes-send-link": row.id }}
              >
                {b.detail.sendLink}
              </PosAction>
              {canMove && !moving ? (
                <PosAction disabled={busy} className="px-[8px] text-[13px]" onClick={() => onOpenMove(row)}>
                  {copy.today.move}
                </PosAction>
              ) : canMove ? (
                <PosAction disabled={busy} className="px-[8px] text-[13px]" onClick={onCancelMove}>
                  {copy.reschedule.cancel}
                </PosAction>
              ) : (
                <PosAction reason={b.detail.rebookOff} className="px-[8px] text-[13px]">
                  {b.detail.rebook}
                </PosAction>
              )}
            </div>
          </div>
        </div>
      </div>

      {moving ? (
        <form
          className={cn(POS_CARD, "flex flex-col gap-[10px] p-[16px]")}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitMove(row);
          }}
        >
          <p className="m-0 font-admin-body text-[15px] font-semibold text-admin-ink">{copy.reschedule.heading}</p>
          <label className="flex flex-col gap-[4px] font-admin-body text-[13px] text-admin-ink-muted">
            <span>{fill(copy.reschedule.newStart, { zone: timeZone })}</span>
            <input type="datetime-local" className={POS_FIELD} value={moveValue} onChange={(event) => onMoveValueChange(event.target.value)} data-pos-classes-move-input />
          </label>
          <div className="flex gap-[10px]">
            <button type="submit" disabled={busy} className={cn(POS_BTN_PRIMARY, "flex-1 disabled:opacity-60")}>
              {busy ? copy.reschedule.submitting : copy.reschedule.submit}
            </button>
            <PosAction disabled={busy} onClick={onCancelMove} className="flex-1">
              {copy.reschedule.cancel}
            </PosAction>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "·";
}

/* ── Add extra (B02) ───────────────────────────────────────────────────── */

export function AddExtraSheet({
  row,
  sale,
  extras,
  copy,
  currency,
  busy,
  onAdd,
  onClose,
}: {
  row: ClassesAppointment;
  sale: PosSaleView | null;
  extras: readonly ClassesExtra[];
  copy: ClassesCopy;
  currency: string;
  busy: boolean;
  onAdd: (extra: ClassesExtra) => void;
  onClose: () => void;
}) {
  const b = copy.board;
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const shown = extras.filter((e) => e.title.toLowerCase().includes(query.trim().toLowerCase()));
  const picked = extras.find((e) => e.offeringId === pickedId) ?? null;
  const cur = sale?.currency ?? currency;
  const balance = (sale?.outstandingCents ?? row.outstandingCents) + (picked?.amountCents ?? 0);

  return (
    <PosSheet
      title={fill(b.extra.title, { name: row.customerName ?? copy.today.nobody })}
      subtitle={b.extra.subtitle}
      onClose={onClose}
      closeLabel={b.extra.cancel}
      attrs={{ "data-pos-classes-extra-sheet": row.id }}
      footer={
        <>
          <PosAction onClick={onClose} disabled={busy}>
            {b.extra.cancel}
          </PosAction>
          <PosAction
            tone="primary"
            disabled={busy || !picked}
            className="h-[56px] text-[17px]"
            onClick={() => picked && onAdd(picked)}
            testAttr={{ "data-pos-classes-extra-add": "add" }}
          >
            {busy ? b.extra.adding : picked ? fill(b.extra.add, { item: picked.title, amount: formatOrderMoney(picked.amountCents, cur) }) : b.detail.addService}
          </PosAction>
        </>
      }
    >
      <input className={POS_FIELD} placeholder={b.extra.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={b.extra.search} />
      {shown.length === 0 ? (
        <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{b.extra.noMatch}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[8px] p-0" role="radiogroup" aria-label={b.extra.search}>
          {shown.map((extra) => {
            const on = extra.offeringId === pickedId;
            return (
              <li key={extra.offeringId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-pos-classes-extra={extra.offeringId}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-[12px] rounded-[12px] border px-[14px] py-[12px] text-left font-admin-body",
                    on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong",
                  )}
                  onClick={() => setPickedId(extra.offeringId)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-semibold text-admin-ink">{extra.title}</span>
                    <span className="block text-[13px] text-admin-ink-muted">
                      +{formatOrderMoney(extra.amountCents, cur)}
                      {extra.kind === "product" ? ` · ${b.detail.lineProduct}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[13px] font-semibold text-admin-ink-muted">
                    {extra.durationMinutes ? fill(b.extra.minutes, { n: extra.durationMinutes }) : b.extra.noTime}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked?.durationMinutes ? <p className="m-0 font-admin-body text-[13px] text-admin-ink-muted">{b.extra.timeNotReplanned}</p> : null}
      <div className={cn(POS_CARD, "px-[16px] py-[6px]")}>
        <PosFact label={b.extra.who}>{row.title}</PosFact>
        <PosFact label={b.extra.newBalance}>{formatOrderMoney(balance, cur)}</PosFact>
      </div>
    </PosSheet>
  );
}
