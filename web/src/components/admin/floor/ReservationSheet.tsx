"use client";

/**
 * ReservationSheet — R01 "New reservation" (`R01_NewReservation`), R02
 * "Unavailable · alternatives" and R03 "Reserved" as one sheet with three
 * states, over the SAME rules the website's booking block uses.
 *
 * Staff entry, same rules as the website: the times offered are
 * `loadTimes` (the block's own availability reader for this party on this
 * date), the booking is `create` (the block's own writer, with the staff
 * member as the actor), and a date the venue does not serve or a party no
 * band fits is refused in the block's own words with the other days still
 * pickable (R02). A deposit the rules ask for is collected at the counter:
 * the reservation's order is opened there once (R03's "collect").
 *
 * Not on this sheet, said: a table preference (nothing stores it on a
 * booking), a note (the website's field is not wired here), an occasion.
 */

import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import { cn } from "@/lib/utils";
import { POS_INPUT, POS_LABEL, POS_NOTE_INFO, POS_PILL, POS_PILL_GREEN, POS_PRIMARY_ACTION, POS_REFUSAL_BANNER, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import { floorRefusalText, type FloorBoardCopy } from "./floor-copy";
import { FACT_ROW, FLOOR_EYEBROW } from "./floor-tones";
import type { FloorActions, FloorBoardData, FloorReserveTimes } from "./floor-types";

export type ReservationSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly busy: boolean;
  readonly loadTimes: NonNullable<FloorActions["loadReserveTimes"]>;
  readonly create: NonNullable<FloorActions["createReservation"]>;
  readonly checkHref: (orderId: string) => string;
  readonly onClose: () => void;
  readonly onDone: (notice: string) => void;
};

type Done = { orderId: string; admissionId: string; collectCents: number; startsAtIso: string };

function dayLabel(ymd: string, locale: string, timeZone: string): string {
  const at = new Date(`${ymd}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(at);
  } catch {
    return ymd || timeZone;
  }
}

export function ReservationSheet(props: ReservationSheetProps) {
  const { data, copy } = props;
  const r = copy.reservation;
  const [party, setParty] = useState(2);
  const [onDate, setOnDate] = useState<string | null>(null);
  const [times, setTimes] = useState<FloorReserveTimes | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const busy = props.busy || saving;

  // `loadTimes` is the route's server action, a stable import, so the first
  // load runs once; later loads follow a date or party change below.
  const { loadTimes } = props;
  const load = useCallback(
    async (date: string | null, n: number) => {
      setLoading(true);
      setRefusal(null);
      try {
        const next = await loadTimes({ onDate: date, partySize: n });
        setTimes(next);
        setSlot(null);
        if (next.ok && !date) setOnDate(next.onDate);
      } catch {
        setTimes({ ok: false, reason: "unavailable", dates: [] });
      } finally {
        setLoading(false);
      }
    },
    [loadTimes],
  );

  useEffect(() => {
    void load(null, 2);
  }, [load]);

  function pickDate(date: string) {
    setOnDate(date);
    void load(date, party);
  }

  function pickParty(n: number) {
    const next = Math.min(200, Math.max(1, n));
    setParty(next);
    void load(onDate, next);
  }

  async function confirm() {
    if (!onDate || !slot) return;
    if (!email.trim() && !phone.trim()) {
      setRefusal(r.contactNeeded);
      return;
    }
    setSaving(true);
    setRefusal(null);
    try {
      const out = await props.create({ onDate, startsAtIso: slot, partySize: party, name: name.trim(), email: email.trim(), phone: phone.trim() });
      if (!out.ok) {
        setRefusal(floorRefusalText(copy, out.reason));
        return;
      }
      setDone({ orderId: out.orderId, admissionId: out.admissionId, collectCents: out.collectCents, startsAtIso: slot });
      props.onDone(interpolate(r.done, { time: venueHhmm(slot, data.timeZone, data.locale), name: name.trim() || copy.panel.walkIn, n: party }));
    } catch {
      setRefusal(floorRefusalText(copy, "unavailable"));
    } finally {
      setSaving(false);
    }
  }

  const deposit = times?.ok ? times.depositCents : 0;
  const currency = times?.ok ? times.currency : "USD";
  const dates = times?.dates ?? [];
  const canConfirm = Boolean(onDate && slot) && !busy && !loading && !done;

  const body = done ? (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-admin-success-soft text-admin-success">
        <Check aria-hidden size={28} strokeWidth={2} />
      </span>
      <p className="m-0 text-[22px] font-semibold text-admin-ink">
        {interpolate(r.done, { time: venueHhmm(done.startsAtIso, data.timeZone, data.locale), name: name.trim() || copy.panel.walkIn, n: party })}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <span className={cn(POS_PILL, POS_PILL_GREEN)}>{copy.panel.stateConfirmed}</span>
        {done.collectCents > 0 && <span className={cn(POS_PILL, "bg-admin-coral-soft text-admin-coral-deep")}>{interpolate(r.deposit, { amount: formatOrderMoney(done.collectCents, currency) })}</span>}
      </div>
      {done.collectCents > 0 && (
        <a href={props.checkHref(done.orderId)} className={POS_PRIMARY_ACTION}>
          {interpolate(r.collectNext, { amount: formatOrderMoney(done.collectCents, currency) })}
        </a>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      {refusal && (
        <div role="alert" data-floor-reservation-refusal className={POS_REFUSAL_BANNER}>
          <p className="m-0 flex-1">{refusal}</p>
        </div>
      )}
      <div>
        <span className={POS_LABEL}>{r.date}</span>
        <div className="flex flex-wrap gap-2">
          {dates.length === 0 && !loading ? (
            <span className="text-[14px] text-admin-ink-muted">{times && !times.ok ? floorRefusalText(copy, times.reason) : r.loading}</span>
          ) : (
            dates.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={onDate === d}
                disabled={busy}
                onClick={() => pickDate(d)}
                className={cn(
                  "h-11 rounded-[12px] border-[1.5px] px-3.5 text-[15px] font-semibold",
                  onDate === d ? "border-admin-brand bg-admin-brand-soft text-admin-brand" : "border-admin-border bg-admin-card text-admin-ink hover:bg-admin-surface-alt",
                )}
              >
                {dayLabel(d, data.locale, data.timeZone)}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span id="floor-reserve-party" className={POS_LABEL}>
            {r.party}
          </span>
          <div className="flex h-[52px] items-stretch overflow-hidden rounded-[12px] border-[1.5px] border-admin-border bg-admin-card">
            <button type="button" aria-label={copy.seat.fewer} disabled={busy || party <= 1} onClick={() => pickParty(party - 1)} className="w-[52px] text-[22px] text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40">
              −
            </button>
            <output aria-labelledby="floor-reserve-party" className="flex flex-1 items-center justify-center gap-1.5 border-x border-admin-border text-[18px] font-semibold text-admin-ink">
              {party}
              <span className="text-[13px] font-normal text-admin-ink-muted">{copy.walkIn.guests}</span>
            </output>
            <button type="button" aria-label={copy.seat.more} disabled={busy} onClick={() => pickParty(party + 1)} className="w-[52px] text-[22px] text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40">
              +
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="floor-reserve-name" className={POS_LABEL}>
            {r.customer}
          </label>
          <input id="floor-reserve-name" className={POS_INPUT} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="floor-reserve-email" className={POS_LABEL}>
            {r.email}
          </label>
          <input id="floor-reserve-email" type="email" className={POS_INPUT} value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="floor-reserve-phone" className={POS_LABEL}>
            {r.phone}
          </label>
          <input id="floor-reserve-phone" type="tel" className={POS_INPUT} value={phone} disabled={busy} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <section className="flex flex-col gap-2.5">
        <p className={cn("m-0", FLOOR_EYEBROW)}>
          {interpolate(r.availability, { date: onDate ? dayLabel(onDate, data.locale, data.timeZone) : "", n: party })}
        </p>
        {loading ? (
          <p className="m-0 text-[14px] text-admin-ink-muted">{r.loading}</p>
        ) : times && !times.ok ? (
          <p className={cn("m-0", POS_REFUSAL_BANNER)}>{floorRefusalText(copy, times.reason)}</p>
        ) : times && times.slots.length === 0 ? (
          <p className="m-0 text-[14px] text-admin-ink-muted">{floorRefusalText(copy, "time_not_offered")}</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={r.time}>
            {(times?.ok ? times.slots : []).map((s) => (
              <button
                key={s.startsAtIso}
                type="button"
                role="radio"
                aria-checked={slot === s.startsAtIso}
                data-floor-reserve-slot={s.label}
                disabled={busy}
                onClick={() => setSlot(s.startsAtIso)}
                className={cn(
                  "h-11 rounded-[12px] border-[1.5px] px-3.5 text-[15px] font-semibold tabular-nums",
                  slot === s.startsAtIso ? "border-admin-brand bg-admin-brand-soft text-admin-brand" : "border-admin-border bg-admin-card text-admin-ink hover:bg-admin-surface-alt",
                )}
                title={s.isLastSeating ? r.lastSeating : s.isUpsize ? r.upsize : undefined}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2.5">
        <p className={cn("m-0", FLOOR_EYEBROW)}>{r.where}</p>
        <p className="m-0 text-[14px] text-admin-ink-muted">{r.whereReason}</p>
      </section>
      <section className="flex flex-col gap-2.5">
        <p className={cn("m-0", FLOOR_EYEBROW)}>{r.money}</p>
        <div className="rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-1">
          <div className={FACT_ROW}>
            <span className="text-admin-ink-muted">{deposit > 0 ? interpolate(r.deposit, { amount: formatOrderMoney(deposit, currency) }) : r.noDeposit}</span>
            <strong className="text-right text-admin-ink">{deposit > 0 ? r.depositSub : r.noDepositSub}</strong>
          </div>
        </div>
      </section>
      <p className={cn("m-0", POS_NOTE_INFO)}>
        <Check aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        {r.noteReason}
      </p>
    </div>
  );

  return (
    <PosSheet
      open={props.open}
      name="new-reservation"
      title={r.title}
      subtitle={r.subtitle}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={saving} onClick={props.onClose}>
          {done ? copy.waiting.close : r.cancel}
        </button>
      }
      footerEnd={
        done ? undefined : (
          <button type="button" data-floor-reserve-confirm className={POS_PRIMARY_ACTION} disabled={!canConfirm} onClick={() => void confirm()}>
            {deposit > 0 ? interpolate(r.confirmDeposit, { amount: formatOrderMoney(deposit, currency) }) : r.confirm}
          </button>
        )
      }
    >
      {body}
    </PosSheet>
  );
}
