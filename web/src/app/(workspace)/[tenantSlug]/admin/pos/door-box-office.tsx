"use client";

/**
 * BoxOfficeScreen — E01 (pick the event and the date), E02 + G06 (the tiers
 * as tiles, the basket with its quantities, the Recent card), then hands the
 * basket to `DoorCheckout` (E04 who is coming, the cash, E06 issued, E07 not
 * issued yet).
 *
 * THE BASKET IS THE DRAFT ORDER. A tap on a tile opens a draft with one line
 * (`posDoorOpenTicketSale`) or adds a line to it (`posDoorAddTicketLine`);
 * the steppers are the counter's own `posUpdateLine` / `posRemoveLine`. What
 * the basket draws is re-read through `posDoorReadSale` after every write,
 * never assembled from the tap. "n left" on a tile is the pool's own answer
 * (`capacityRemaining`), the one authority.
 *
 * Seats are held when the cash is confirmed (`startCollection` reserves
 * before any money moves), not when the basket is built: the board's "Hold 3
 * places" is drawn as "Continue · 3 tickets" and says so under the button.
 */

import { Minus, Plus, ScanLine, Search, User } from "lucide-react";
import { useCallback, useState } from "react";

import { PosRefusalBanner, type PosCollectionMethodState, type PosRefusalReason } from "@/components/admin/pos";
import { POS_EYEBROW, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import { cn } from "@/lib/utils";

import { posRemoveLine, posUpdateLine } from "./actions";
import { posDoorAddTicketLine, posDoorCancelTicketSale, posDoorOpenTicketSale, posDoorReadSale, type DoorSaleView, type DoorTonightSession } from "./door-actions";
import { DoorCheckout, type Buyer } from "./door-box-checkout";
import { dateAt, timeAt, type DoorScreenCopy, type OpenDoor, type RecentScan } from "./door-shared";
import { Pill } from "./door-ui";

export type BoxOfficeScreenProps = {
  sessions: DoorTonightSession[];
  tonightIds: Set<string>;
  door: OpenDoor | null;
  doorFailed: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  openDoor: (session: DoorTonightSession) => Promise<void>;
  recent: RecentScan[];
  drawerOpen: boolean;
  methods: PosCollectionMethodState[];
  currency: string;
  receiptOrigin: string;
  zone: string;
  locale: string;
  copy: DoorScreenCopy;
  onScan: () => void;
  onFindOrder: () => void;
};

type Step = "pick" | "tiers" | "checkout";

export function BoxOfficeScreen(props: BoxOfficeScreenProps) {
  const { copy, zone, locale, door } = props;
  const box = copy.door.box;
  const [step, setStep] = useState<Step>(door ? "tiers" : "pick");
  const [eventId, setEventId] = useState<string | null>(door?.session.eventId ?? props.sessions[0]?.eventId ?? null);
  const [dateId, setDateId] = useState<string | null>(door?.session.id ?? null);
  const [sale, setSale] = useState<DoorSaleView | null>(null);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", email: "", phone: "" });
  const [refusal, setRefusal] = useState<PosRefusalReason | null>(null);

  const run = useCallback(
    async <T extends { ok: boolean; reason?: unknown; error?: unknown }>(fn: () => Promise<T>): Promise<T> => {
      props.setBusy(true);
      setRefusal(null);
      try {
        const result = await fn();
        setRefusal(refusalFromResult(result, "sale"));
        return result;
      } finally {
        props.setBusy(false);
      }
    },
    [props],
  );

  const reload = useCallback(
    async (orderId: string) => {
      const read = await posDoorReadSale(orderId);
      if (read.ok) {
        if (read.sale.lines.length === 0) {
          await posDoorCancelTicketSale(orderId, read.sale.version);
          setSale(null);
        } else setSale(read.sale);
      } else setSale(null);
    },
    [],
  );

  /** One more or one fewer of a tier: the draft's own line commands, then a re-read. */
  const bump = useCallback(
    async (variantId: string, delta: 1 | -1) => {
      if (!door || props.busy) return;
      const line = sale?.lines.find((l) => l.variantId === variantId) ?? null;
      const result = await run(async () => {
        if (!sale) {
          if (delta < 0) return { ok: true as const };
          return posDoorOpenTicketSale({ sessionId: door.session.id, variantId, units: 1 });
        }
        if (!line) {
          if (delta < 0) return { ok: true as const };
          return posDoorAddTicketLine({ orderId: sale.orderId, sessionId: door.session.id, variantId, units: 1, expectedVersion: sale.version });
        }
        const next = line.units + delta;
        if (next <= 0) return posRemoveLine({ orderId: sale.orderId, lineId: line.id, expectedVersion: sale.version });
        return posUpdateLine({ orderId: sale.orderId, lineId: line.id, units: next, expectedVersion: sale.version });
      });
      const orderId = sale?.orderId ?? (result.ok && "sale" in result ? result.sale.orderId : null);
      if (orderId) await reload(orderId);
    },
    [door, props.busy, reload, run, sale],
  );

  const cancelSale = useCallback(async () => {
    if (!sale) return;
    const result = await run(() => posDoorCancelTicketSale(sale.orderId, sale.version));
    if (result.ok) setSale(null);
  }, [run, sale]);

  // ── E01: the event and the date ───────────────────────────────────────
  const events = [...new Map(props.sessions.map((s) => [s.eventId, s])).values()];
  const dates = props.sessions.filter((s) => s.eventId === eventId);
  const chosen = dates.find((s) => s.id === dateId) ?? null;

  if (step === "pick" || !door) {
    return (
      <div data-door-pick className="flex min-h-0 flex-1">
        <div className="flex w-1/2 flex-col gap-3 overflow-y-auto border-r border-admin-border px-[22px] py-[18px]">
          <div className={POS_EYEBROW}>{box.eyebrowEvents}</div>
          {events.length === 0 && !props.doorFailed && <p className="m-0 text-[15px] text-admin-ink-muted">{copy.door.noSessions}</p>}
          {props.doorFailed && (
            <p role="alert" className="m-0 text-[14px] text-admin-red">
              {copy.door.loadFailed}
            </p>
          )}
          {events.map((e) => {
            const active = e.eventId === eventId;
            return (
              <button
                key={e.eventId}
                type="button"
                data-door-event={e.eventId}
                aria-pressed={active}
                onClick={() => {
                  setEventId(e.eventId);
                  setDateId(null);
                }}
                className={cn(POS_SURFACE, "flex min-h-[64px] items-center gap-3 px-4 py-3 text-left", active ? "border-admin-brand bg-admin-brand-soft" : "hover:bg-admin-surface-alt")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-admin-ink">{e.title}</span>
                  <span className="block truncate text-[13.5px] text-admin-ink-muted">
                    {interpolate(box.eventNights, { count: props.sessions.filter((s) => s.eventId === e.eventId).length, date: dateAt(e.startsAt, zone, locale) })}
                  </span>
                </span>
                <Pill tone="green">{box.onSale}</Pill>
              </button>
            );
          })}
        </div>
        <div className="flex w-1/2 flex-col gap-3 overflow-y-auto bg-admin-surface px-[22px] py-[18px]">
          <div className={POS_EYEBROW}>{box.eyebrowDates}</div>
          {dates.map((s) => {
            const active = s.id === dateId;
            const tonight = props.tonightIds.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                data-door-session={s.id}
                aria-pressed={active}
                onClick={() => setDateId(s.id)}
                className={cn(POS_SURFACE, "flex min-h-[64px] items-center gap-3 px-4 py-3 text-left", active ? "border-admin-brand bg-admin-brand-soft" : "hover:bg-admin-surface-alt")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-admin-ink">
                    {dateAt(s.startsAt, zone, locale)} · {timeAt(s.startsAt, zone, locale)}
                  </span>
                  <span className="block truncate text-[13.5px] text-admin-ink-muted">
                    {s.capacity === null ? box.noPool : interpolate(box.left, { count: Math.max(0, s.capacity - s.expected) })}
                    {" · "}
                    {interpolate(copy.door.pick.counts, { admitted: s.admitted, expected: s.expected, capacity: s.capacity ?? copy.door.pick.noPool })}
                  </span>
                </span>
                <Pill tone={active ? "green" : tonight ? "indigo" : "slate"}>{active ? box.selected : tonight ? box.tonight : dateAt(s.startsAt, zone, locale)}</Pill>
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            type="button"
            disabled={!chosen || props.busy}
            data-door-continue-date
            onClick={async () => {
              if (!chosen) return;
              await props.openDoor(chosen);
              setSale(null);
              setStep("tiers");
            }}
            className={cn(POS_PRIMARY_ACTION, "h-[60px] w-full")}
          >
            {chosen ? interpolate(box.continueDate, { date: dateAt(chosen.startsAt, zone, locale) }) : box.pickDate}
          </button>
        </div>
      </div>
    );
  }

  if (step === "checkout" && sale) {
    return (
      <DoorCheckout
        door={door}
        sale={sale}
        buyer={buyer}
        setBuyer={setBuyer}
        busy={props.busy}
        setBusy={props.setBusy}
        methods={props.methods}
        receiptOrigin={props.receiptOrigin}
        zone={zone}
        locale={locale}
        copy={copy}
        onBack={() => setStep("tiers")}
        onDone={async () => {
          setSale(null);
          setBuyer({ name: "", email: "", phone: "" });
          await props.openDoor(door.session);
          setStep("tiers");
        }}
      />
    );
  }

  // ── E02 + G06: the tiers and the basket ───────────────────────────────
  const total = sale?.totalCents ?? 0;
  const currency = sale?.currency ?? props.currency;
  const count = sale?.lines.reduce((sum, l) => sum + l.units, 0) ?? 0;
  const sold = door.rows.filter((r) => r.status === "valid").length;

  return (
    <div data-door-box className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-admin-border bg-admin-surface px-[22px]">
        <Pill tone="indigo" className="text-[14px]">
          {interpolate(box.soldChip, { sold, admitted: door.counts.arrived })}
        </Pill>
        <Pill tone="slate" className="text-[14px]">
          {props.drawerOpen ? box.drawerOpen : box.drawerNone}
        </Pill>
        <span className="flex-1" />
        <button type="button" onClick={() => setStep("pick")} className="text-[14px] font-semibold text-admin-ink-muted hover:text-admin-ink">
          {box.back}
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_420px]">
        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-6 py-[18px]">
          {refusal && <PosRefusalBanner reason={refusal} copy={copy.refusal} onRetry={() => setRefusal(null)} />}
          {door.tiers.length === 0 ? (
            <p className={cn(POS_SURFACE, "m-0 px-5 py-6 text-center text-[15px] text-admin-ink-muted")}>{box.noTiers}</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {door.tiers.map((t) => {
                const line = sale?.lines.find((l) => l.variantId === t.variantId) ?? null;
                const soldOut = t.hasPool && t.remaining !== null && t.remaining <= 0;
                const off = !t.hasPool || soldOut;
                return (
                  <button
                    key={t.variantId}
                    type="button"
                    disabled={off || props.busy}
                    title={!t.hasPool ? box.tierNoPool : soldOut ? box.tierSoldOut : undefined}
                    data-door-tier={t.variantId}
                    onClick={() => void bump(t.variantId, 1)}
                    className={cn(
                      POS_SURFACE,
                      "relative flex h-[112px] flex-col justify-between p-4 text-left transition-colors hover:bg-admin-surface-alt disabled:cursor-not-allowed disabled:opacity-45",
                      line && "border-admin-brand bg-admin-brand-soft",
                    )}
                  >
                    <span className="text-[16px] font-semibold text-admin-ink">{t.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[16px] font-bold tabular-nums tracking-[-0.025em] text-admin-ink">{formatOrderMoney(t.amountCents, currency)}</span>
                      <span className="text-[13px] text-admin-ink-muted">
                        {!t.hasPool ? box.tierNoPool : soldOut ? box.tierSoldOut : t.remaining === null ? box.noPool : interpolate(box.tierLeft, { count: t.remaining })}
                      </span>
                    </span>
                    {line && (
                      <span className="absolute right-3 top-3 inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-admin-brand px-2 text-[14px] font-bold text-admin-card" data-door-tier-qty={t.variantId}>
                        {line.units}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className={cn(POS_SURFACE, "border-[1px]")}>
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className={POS_EYEBROW}>{box.recent}</div>
              {props.recent.length === 0 && <p className="m-0 text-[14px] text-admin-ink-muted">{box.recentEmpty}</p>}
              {props.recent.map((r, i) => (
                <div key={`${r.time}-${i}`} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[16px] font-bold",
                      r.tone === "in" ? "bg-admin-success-soft text-admin-success" : r.tone === "refused" ? "bg-admin-critical-soft text-admin-red" : "bg-admin-coral-soft text-admin-coral-deep",
                    )}
                    aria-hidden
                  >
                    {r.tone === "in" ? "✓" : r.tone === "refused" ? "✕" : "!"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-admin-ink">{r.text}</span>
                  <span className="text-[13px] tabular-nums text-admin-ink-muted">{r.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div data-door-basket className="flex min-h-0 flex-col border-l border-admin-border bg-admin-card">
          <div className="flex items-center gap-2 border-b border-admin-border px-4 py-3">
            <button
              type="button"
              disabled={!sale}
              onClick={() => setStep("checkout")}
              className={cn(POS_SECONDARY_ACTION, "h-11 px-3.5 text-[14px]")}
              data-door-buyer
            >
              <User aria-hidden size={18} strokeWidth={1.75} />
              {buyer.name ? interpolate(box.buyerSet, { name: buyer.name }) : box.buyer}
            </button>
            <span className="flex-1" />
            <Pill tone="slate">{sale ? box.namesAtGate : box.notHeldYet}</Pill>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sale?.lines.map((l) => (
              <div key={l.id} className="flex items-center gap-3 border-t border-admin-border-soft px-4 py-3" data-door-line={l.id}>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold tabular-nums text-admin-ink">{l.units}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-admin-ink">{l.label}</span>
                  <span className="block truncate text-[14.5px] text-admin-ink-muted">
                    {dateAt(door.session.startsAt, zone, locale)} · {timeAt(door.session.startsAt, zone, locale)}
                  </span>
                </span>
                <span className="inline-flex overflow-hidden rounded-[10px] border-[1.5px] border-admin-border">
                  <button type="button" aria-label={box.minus} disabled={props.busy} onClick={() => void (l.variantId && bump(l.variantId, -1))} className="inline-flex h-10 w-10 items-center justify-center text-admin-ink hover:bg-admin-surface-alt">
                    <Minus aria-hidden size={16} strokeWidth={2} />
                  </button>
                  <button type="button" aria-label={box.plus} disabled={props.busy} onClick={() => void (l.variantId && bump(l.variantId, 1))} className="inline-flex h-10 w-10 items-center justify-center border-l-[1.5px] border-admin-border text-admin-ink hover:bg-admin-surface-alt">
                    <Plus aria-hidden size={16} strokeWidth={2} />
                  </button>
                </span>
                <span className="w-[72px] text-right text-[16.5px] font-bold tabular-nums text-admin-ink">{formatOrderMoney(l.totalCents, currency)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-admin-border px-4 pb-4 pt-3">
            <div className="flex items-center justify-between text-[15px]">
              <span className="text-admin-ink-muted">{box.fees}</span>
              <span className="font-semibold text-admin-ink">{box.feesIncluded}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[17px] font-bold text-admin-ink">{box.total}</span>
              <span className="text-[30px] font-bold tabular-nums tracking-[-0.025em] text-admin-ink" data-door-total>
                {formatOrderMoney(total, currency)}
              </span>
            </div>
            <button type="button" disabled={!sale || props.busy} data-door-continue onClick={() => setStep("checkout")} className={cn(POS_PRIMARY_ACTION, "h-[60px] w-full")}>
              {interpolate(box.continueTickets, { count })}
            </button>
            <p className="m-0 text-center text-[12.5px] text-admin-ink-muted">{box.continueHint}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={props.onScan} className={POS_SECONDARY_ACTION}>
                <ScanLine aria-hidden size={18} strokeWidth={1.75} />
                {box.scan}
              </button>
              <button type="button" onClick={props.onFindOrder} className={POS_SECONDARY_ACTION}>
                <Search aria-hidden size={18} strokeWidth={1.75} />
                {box.findOrder}
              </button>
            </div>
            {sale && (
              <button type="button" disabled={props.busy} onClick={() => void cancelSale()} className="text-[13px] font-semibold text-admin-ink-muted hover:text-admin-red">
                {box.cancelSale}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
