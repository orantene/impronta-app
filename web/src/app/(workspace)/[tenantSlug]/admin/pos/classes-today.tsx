"use client";

/**
 * classes-today.tsx — the Front desk's Today screen as board B01 draws it:
 * the 360px day list on the left (Today / Due / Done, Appts | Classes, rows
 * TIME · name · service · state pill, Walk-in / Book), the selected
 * appointment on the right (avatar · name · time range, the chips, BOOKED
 * and ADDED TODAY lines from the sale, Add service / Product / Use a pass,
 * the totals card, WHO DID WHAT, Collect, Send payment link / Rebook or
 * Move it), and the Add-extra sheet (B02).
 *
 * The list row is `[data-pos-classes-appointment]` and the detail pane is
 * `[data-pos-classes-detail]`, both keyed by the booking id, so a journey
 * selects a row and acts in the pane. The row's pill carries
 * `data-pos-classes-state`, which is what the stale-screen refusal turns on:
 * "Check in" sends the state the OPERATOR SAW.
 *
 * BOOKED vs ADDED TODAY: a line linked to the booking (`bookingId`, the
 * Counter's link-a-sale) or carrying the booking's own service (its label is
 * the appointment's title, which is how an instant booking names its one
 * service) was booked; every other line was added at the desk. A sale line
 * records no "added at" instant of its own, so this is the closest fact the
 * reader holds. Services vs Retail: a line whose offering the till lists as
 * a product.
 *
 * WIRED: Check in, Collect (the Counter's cash charge), Move it (the A09
 * sheet, `classes-move.tsx`), Add service / Product (the Counter's
 * `posAddLine` on the appointment's own sale, version carried). NOT WIRED,
 * said on the control (D-POS-19): Use a pass, Who did what, Send payment
 * link, Rebook.
 */

import { useState, type ReactNode } from "react";

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesAppointment, ClassesAppointmentState, ClassesSession } from "@/lib/pos/classes/day";
import type { ClassesExtra } from "@/lib/pos/classes/extras";
import type { PosSaleView } from "@/lib/pos/commands";
import { cn } from "@/lib/utils";

import { fill, formatClock } from "./classes-format";
import { POS_CARD, POS_EYEBROW, POS_FIELD, PosAction, PosChip, PosFact, PosIcon, PosPill, PosSegmented, PosSheet, type PosPillTone } from "./classes-ui";

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

const LIST_ROW = "flex cursor-pointer items-center gap-[12px] border-t border-admin-border-soft px-[16px] py-[14px] font-admin-body";

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
    <div className="flex h-full min-h-0 w-[360px] shrink-0 flex-col border-r border-admin-border bg-admin-card">
      <div className="flex flex-wrap items-center justify-between gap-[8px] px-[14px] pb-[8px] pt-[14px]">
        <PosSegmented<TodayTab>
          label={copy.today.heading}
          value={tab}
          onChange={onTab}
          size="lg"
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
          size="md"
          options={[
            { id: "appts", label: b.list.segAppts },
            { id: "classes", label: b.list.segClasses },
          ]}
        />
      </div>
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
        {segment === "classes" ? (
          sessions.length === 0 ? (
            <li className="border-t border-admin-border-soft px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{copy.sessions.empty}</li>
          ) : (
            sessions.map((session) => {
              const seats = session.seats;
              const full = seats.kind === "counted" && seats.remaining <= 0;
              const here = session.roster.filter((r) => r.kind === "admission" && r.admittedCount > 0).length;
              return (
                <li
                  key={session.id}
                  data-pos-classes-session={session.id}
                  aria-current={session.id === selectedSessionId ? "true" : undefined}
                  className={cn(LIST_ROW, session.id === selectedSessionId ? "bg-admin-brand-soft" : "hover:bg-admin-surface")}
                  onClick={() => onSelectSession(session)}
                >
                  <span className="w-[46px] shrink-0 font-mono text-[14px] text-admin-ink-muted">{formatClock(session.startsAt, timeZone, locale)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold text-admin-ink">
                      {session.title}
                      {seats.kind === "counted" ? ` · ${seats.total - seats.remaining}/${seats.total}` : ""}
                    </span>
                    <span className="block truncate text-[13.5px] text-admin-ink-muted" data-pos-classes-seats>
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
          <li className="border-t border-admin-border-soft px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">
            {tab === "due" ? b.list.emptyDue : tab === "done" ? b.list.emptyDone : copy.today.empty}
          </li>
        ) : (
          visible.map((row) => (
            <li
              key={row.id}
              data-pos-classes-appointment={row.id}
              aria-current={row.id === selectedId ? "true" : undefined}
              className={cn(LIST_ROW, row.id === selectedId ? "bg-admin-brand-soft" : "hover:bg-admin-surface")}
              onClick={() => onSelect(row)}
            >
              <span className="w-[46px] shrink-0 font-mono text-[14px] text-admin-ink-muted">{formatClock(row.startsAt, timeZone, locale)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold text-admin-ink">{row.customerName ?? copy.today.nobody}</span>
                <span className="block truncate text-[13.5px] text-admin-ink-muted">{row.title}</span>
              </span>
              <PosPill tone={STATE_TONE[row.state]} attrs={{ "data-pos-classes-state": row.state }}>
                {row.state === "in_progress" ? copy.today.arrived : copy.state[row.state]}
                {row.orderId && row.outstandingCents > 0 && row.state !== "cancelled" ? ` · ${formatOrderMoney(row.outstandingCents, row.currency)}` : ""}
              </PosPill>
            </li>
          ))
        )}
      </ul>
      <div className="grid grid-cols-2 gap-[8px] border-t border-admin-border px-[14px] py-[12px]">
        <PosAction tone="outline" onClick={onWalkIn} testAttr={{ "data-pos-classes-walkin": "open" }}>
          <PosIcon name="plus" />
          {b.list.walkIn}
        </PosAction>
        <PosAction onClick={onBook} testAttr={{ "data-pos-classes-book-open": "open" }}>
          <PosIcon name="calendar" />
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

type SaleLine = PosSaleView["lines"][number];

function LineRow({ line, currency, pill, tone, second }: { line: Pick<SaleLine, "units" | "label" | "totalCents">; currency: string; pill: string; tone: PosPillTone; second: string | null }) {
  return (
    <li className="flex items-center gap-[12px] border-t border-admin-border-soft px-[16px] py-[13px] font-admin-body">
      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold tabular-nums text-admin-ink">{line.units}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-[1.2] text-admin-ink [overflow-wrap:anywhere]">{line.label}</span>
        {second ? <span className="mt-[2px] block text-[14.5px] leading-[1.2] text-admin-ink-muted">{second}</span> : null}
      </span>
      <PosChip tone={tone} size="sm">
        {pill}
      </PosChip>
      <span className="text-right text-[16.5px] font-bold tabular-nums leading-[1.2] text-admin-ink">{formatOrderMoney(line.totalCents, currency)}</span>
    </li>
  );
}

function SectionHead({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <div className={cn("flex items-center gap-[8px] bg-admin-surface px-[16px] py-[10px] font-admin-body text-[12.5px] font-bold uppercase leading-[1.2] tracking-[0.06em] text-admin-ink-muted", first ? "" : "border-t border-admin-border")}>
      {children}
    </div>
  );
}

export function AppointmentDetail({
  row,
  sale,
  extras,
  timeZone,
  locale,
  copy,
  busy,
  onCheckIn,
  onOpenMove,
  onCollect,
  onAddExtra,
  onSendLink,
  children,
}: {
  row: ClassesAppointment;
  sale: SaleDetail;
  /** The till's extras, so a sale line can be told as retail. */
  extras: readonly ClassesExtra[];
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  onCheckIn: (row: ClassesAppointment) => void;
  onOpenMove: (row: ClassesAppointment) => void;
  onCollect: (row: ClassesAppointment) => void;
  onAddExtra: () => void;
  /** B01's `Send payment link`; absent where the surface cannot mint one. */
  onSendLink?: (row: ClassesAppointment) => void;
  /** The move sheet (A09), rendered inside the pane so it is the pane's. */
  children?: ReactNode;
}) {
  const b = copy.board;
  const arrived = row.state === "in_progress";
  const canCheckIn = row.state === "confirmed" || row.state === "tentative" || row.state === "draft";
  const canMove = canCheckIn || arrived;
  const ready = sale.status === "ready" ? sale.sale : null;
  const currency = ready?.currency ?? row.currency;
  const products = new Set(extras.filter((e) => e.kind === "product").map((e) => e.offeringId));
  const isRetail = (line: SaleLine) => line.offeringId !== null && products.has(line.offeringId);
  const wasBooked = (line: SaleLine) => line.bookingId !== null || line.label === row.title;
  const booked = ready ? ready.lines.filter(wasBooked) : [];
  const added = ready ? ready.lines.filter((l) => !wasBooked(l)) : [];
  const retail = ready ? ready.lines.filter(isRetail).reduce((n, l) => n + l.totalCents, 0) : null;
  const services = ready ? ready.lines.filter((l) => !isRetail(l)).reduce((n, l) => n + l.totalCents, 0) : null;
  const paid = ready ? ready.depositPaidCents : null;
  const when = `${formatClock(row.startsAt, timeZone, locale)}${row.endsAt ? `–${formatClock(row.endsAt, timeZone, locale)}` : ""}`;
  // B03: sales linked to this booking for payment (`order_lines.booking_id`).
  const linkedOwed = row.linkedSales.reduce((n, sale) => n + sale.outstandingCents, 0);
  const balanceDue = row.outstandingCents + linkedOwed;
  const linePill = (line: SaleLine) =>
    isRetail(line)
      ? { pill: b.detail.lineProduct, tone: "slate" as const }
      : row.state === "completed"
        ? { pill: b.detail.lineDone, tone: "green" as const }
        : wasBooked(line)
          ? { pill: b.detail.booked, tone: arrived ? ("green" as const) : ("slate" as const) }
          : { pill: b.detail.lineAdded, tone: "coral" as const };

  return (
    <div data-pos-classes-detail={row.id} className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto px-[24px] py-[18px]">
      <div className="flex items-center gap-[12px]">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-admin-brand-soft font-admin-body text-[16px] font-bold text-admin-brand">
          {initials(row.customerName ?? "")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-admin-body text-[20px] font-bold leading-[1.2] text-admin-ink">
            {row.customerName ?? copy.today.nobody} · {when}
          </div>
          <div className="font-admin-body text-[14px] leading-[1.2] text-admin-ink-muted">{row.title}</div>
        </div>
        {row.linkedSales.length > 0 ? (
          <PosChip tone="slate" size="sm">
            {fill(b.detail.linkedChip, { reference: row.linkedSales.map((s) => s.reference).join(", ") })}
          </PosChip>
        ) : null}
        {arrived ? (
          <PosChip tone="royal" size="sm">
            {b.detail.checkedIn}
          </PosChip>
        ) : null}
        {row.state === "completed" ? (
          <PosChip tone="green" size="sm">
            {b.detail.serviceDone}
          </PosChip>
        ) : null}
        {row.orderId && row.outstandingCents <= 0 ? (
          <PosChip tone="slate" size="sm">
            {b.detail.paidChip}
          </PosChip>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.25fr)_minmax(300px,1fr)] gap-[14px]">
        {/* The sale's lines */}
        <div className={cn(POS_CARD, "flex min-w-0 flex-col overflow-hidden")}>
          <SectionHead first>{b.detail.booked}</SectionHead>
          {sale.status === "loading" ? (
            <p className="m-0 border-t border-admin-border-soft px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{b.detail.linesLoading}</p>
          ) : sale.status === "unreadable" ? (
            <p role="alert" className="m-0 border-t border-admin-border-soft px-[16px] py-[14px] font-admin-body text-[14px] text-admin-red">
              {b.detail.linesUnreadable}
            </p>
          ) : !ready || booked.length === 0 ? (
            <p className="m-0 border-t border-admin-border-soft px-[16px] py-[14px] font-admin-body text-[14px] text-admin-ink-muted">{b.detail.noLines}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {booked.map((line) => (
                <LineRow key={line.id} line={line} currency={currency} second={null} {...linePill(line)} />
              ))}
            </ul>
          )}
          {added.length > 0 ? (
            <>
              <SectionHead>{b.detail.addedToday}</SectionHead>
              <ul className="m-0 list-none p-0">
                {added.map((line) => (
                  <LineRow key={line.id} line={line} currency={currency} second={null} {...linePill(line)} />
                ))}
              </ul>
            </>
          ) : null}
          {row.linkedSales.map((linked) => (
            <div key={linked.orderId} data-pos-classes-linked-sale={linked.orderId}>
              <SectionHead>{fill(b.detail.linkedFrom, { reference: linked.reference })}</SectionHead>
              <ul className="m-0 list-none p-0">
                {linked.lines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    currency={linked.currency}
                    second={fill(b.detail.fromSale, { reference: linked.reference })}
                    pill={b.detail.linkedPayment}
                    tone="indigo"
                  />
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-auto flex flex-wrap items-center gap-[8px] border-t border-admin-border-soft px-[16px] py-[12px]">
            <PosAction tone="outline" size="sm" reason={row.orderId ? null : b.detail.addOff} onClick={onAddExtra} testAttr={{ "data-pos-classes-add-extra": "open" }}>
              <PosIcon name="plus" />
              {b.detail.addService}
            </PosAction>
            <PosAction size="sm" reason={row.orderId ? null : b.detail.addOff} onClick={onAddExtra}>
              <PosIcon name="tag" />
              {b.detail.product}
            </PosAction>
            <PosAction size="sm" reason={b.detail.usePassOff}>
              <PosIcon name="pass" />
              {b.detail.usePass}
            </PosAction>
          </div>
        </div>

        {/* Totals, who did what, the actions */}
        <div className="flex min-w-0 flex-col gap-[12px]">
          <div className={cn(POS_CARD, "px-[16px] py-[14px]")}>
            <PosFact label={b.detail.services}>{services === null ? "…" : formatOrderMoney(services, currency)}</PosFact>
            <PosFact label={b.detail.retail}>{retail === null ? "…" : formatOrderMoney(retail, currency)}</PosFact>
            {row.linkedSales.map((linked) => (
              <PosFact key={linked.orderId} label={fill(b.detail.linkedSale, { reference: linked.reference })}>
                {formatOrderMoney(linked.outstandingCents, linked.currency)}
              </PosFact>
            ))}
            <PosFact label={b.detail.depositPaid}>{paid === null ? "…" : `−${formatOrderMoney(paid, currency)}`}</PosFact>
            <div className="flex items-center justify-between gap-[8px] pb-[2px] pt-[10px] font-admin-body">
              <span className="text-[17px] font-bold leading-[1.2] text-admin-ink">{b.detail.balanceDue}</span>
              <span className="text-[30px] font-bold tabular-nums leading-[1.2] tracking-[-0.025em] text-admin-ink" data-pos-classes-balance-due>
                {row.orderId || row.linkedSales.length > 0 ? formatOrderMoney(balanceDue, row.currency) : "—"}
              </span>
            </div>
          </div>
          <div className={cn(POS_CARD, "px-[16px] py-[14px]")} title={b.detail.whoDidWhatOff}>
            <div className={POS_EYEBROW}>{b.detail.whoDidWhat}</div>
            <p className="m-0 mt-[8px] font-admin-body text-[14px] leading-[1.4] text-admin-ink-dim">{b.detail.whoDidWhatOff}</p>
          </div>

          <div className="mt-auto flex flex-col gap-[8px]">
            {canCheckIn ? (
              <PosAction tone="primary" size="xl" disabled={busy} className="w-full" onClick={() => onCheckIn(row)}>
                {busy ? copy.today.checkingIn : copy.today.checkIn}
              </PosAction>
            ) : null}
            {row.orderId && row.collectable && row.outstandingCents > 0 ? (
              <PosAction tone="primary" size="xl" disabled={busy} className="w-full" onClick={() => onCollect(row)}>
                {fill(copy.today.collect, { amount: formatOrderMoney(row.outstandingCents, row.currency) })}
              </PosAction>
            ) : null}
            <div className="grid grid-cols-2 gap-[8px]">
              <PosAction
                reason={onSendLink && row.orderId && row.collectable && row.outstandingCents > 0 ? null : b.detail.sendLinkOff}
                className="px-[10px]"
                onClick={onSendLink ? () => onSendLink(row) : undefined}
                testAttr={{ "data-pos-classes-send-link": row.id }}
              >
                {b.detail.sendLink}
              </PosAction>
              {canMove ? (
                <PosAction disabled={busy} className="px-[10px]" onClick={() => onOpenMove(row)}>
                  {copy.today.move}
                </PosAction>
              ) : (
                <PosAction reason={b.detail.rebookOff} className="px-[10px]">
                  {b.detail.rebook}
                </PosAction>
              )}
            </div>
          </div>
        </div>
      </div>
      {children}
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
  timeZone,
  locale,
  busy,
  onAdd,
  onClose,
}: {
  row: ClassesAppointment;
  sale: PosSaleView | null;
  extras: readonly ClassesExtra[];
  copy: ClassesCopy;
  currency: string;
  timeZone: string;
  locale: string;
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
          <PosAction tone="primary" size="lg" disabled={busy || !picked} onClick={() => picked && onAdd(picked)} testAttr={{ "data-pos-classes-extra-add": "add" }}>
            {busy ? b.extra.adding : picked ? fill(b.extra.add, { item: picked.title, amount: formatOrderMoney(picked.amountCents, cur) }) : b.detail.addService}
          </PosAction>
        </>
      }
    >
      <label className="relative block">
        <span className="pointer-events-none absolute left-[16px] top-1/2 -translate-y-1/2 text-admin-ink-dim">
          <PosIcon name="search" size={18} />
        </span>
        <input className={cn(POS_FIELD, "rounded-[14px] pl-[44px] pr-[16px]")} placeholder={b.extra.search} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={b.extra.search} />
      </label>
      {shown.length === 0 ? (
        <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{b.extra.noMatch}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[10px] p-0" role="radiogroup" aria-label={b.extra.search}>
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
                    "flex w-full cursor-pointer items-center gap-[12px] rounded-[14px] border-[1.5px] px-[16px] py-[14px] text-left font-admin-body",
                    on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong",
                  )}
                  onClick={() => setPickedId(extra.offeringId)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-[1.2] text-admin-ink">{extra.title}</span>
                    <span className="block text-[14px] leading-[1.2] text-admin-ink-muted">
                      +{formatOrderMoney(extra.amountCents, cur)}
                      {extra.kind === "product" ? ` · ${b.detail.lineProduct.toLowerCase()}` : extra.durationMinutes ? ` · ${fill(b.extra.minutes, { n: extra.durationMinutes })}` : ""}
                    </span>
                  </span>
                  <span className={cn("max-w-[250px] shrink-0 text-right text-[14px] font-semibold leading-[1.2]", extra.durationMinutes ? "text-admin-coral-deep" : "text-admin-amber")}>
                    {extra.durationMinutes ? b.extra.timeNotReplannedShort : b.extra.noTime}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={cn(POS_CARD, "px-[16px] py-[12px]")}>
        <PosFact label={b.extra.newEndTime} muted={Boolean(picked?.durationMinutes)}>
          {picked?.durationMinutes ? b.extra.timeNotReplanned : row.endsAt ? fill(b.extra.endUnchanged, { time: formatClock(row.endsAt, timeZone, locale) }) : "—"}
        </PosFact>
        <PosFact label={b.extra.who}>{row.title}</PosFact>
        <PosFact label={b.extra.newBalance}>{formatOrderMoney(balance, cur)}</PosFact>
      </div>
    </PosSheet>
  );
}
