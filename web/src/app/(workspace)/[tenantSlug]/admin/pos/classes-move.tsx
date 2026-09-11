"use client";

/**
 * classes-move.tsx — the Move sheet, board A09: "Move {name}'s booking",
 * the day chips, the free times as cards (time over "{person} · free"), the
 * facts (New · Price · Paid so far · Policy · Old slot), and the footer
 * "Keep {old}" / "Move to {new}". A time not on the cards can be typed by
 * hand ("Another time"), on the venue's clock; the engine's own reschedule
 * decides whether it is free, and its refusal names who is busy.
 *
 * Presentational: props in, callbacks out. The state and the command are
 * `classes-move-state.ts`. The sheet keeps the journey's hooks:
 * `[data-pos-classes-move-input]` (the hand-typed time) and the confirm
 * button "Move to …".
 */

import type { ClassesCopy } from "@/components/admin/pos/classes-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { ClassesAppointment } from "@/lib/pos/classes/day";
import type { PosSaleView } from "@/lib/pos/commands";
import { addUtcDays } from "@/lib/scheduling/tz";
import { cn } from "@/lib/utils";

import { fill, formatClock, formatWhen } from "./classes-format";
import type { MoveSlots } from "./classes-move-state";
import { ClassesNotice } from "./classes-panels";
import { POS_CARD, POS_FIELD, POS_HINT, POS_LABEL, PosAction, PosFact, PosSegmented, PosSheet } from "./classes-ui";

/** "Fri 11", the chip's label, for the venue day `offset` days from the day shown. */
function dayChip(ymd: string, offset: number, locale: string): { id: string; label: string } {
  const day = addUtcDays(ymd, offset) ?? ymd;
  let label = day;
  try {
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).formatToParts(new Date(`${day}T12:00:00.000Z`));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    label = `${get("weekday").replace(/\.$/, "")} ${get("day")}`;
  } catch {
    // The raw day is still a label.
  }
  return { id: String(offset), label };
}

export function MoveSheet({
  row,
  sale,
  dayYmd,
  viewedOffset,
  dayOffset,
  slots,
  slotIso,
  manual,
  chosenIso,
  timeZone,
  locale,
  copy,
  busy,
  onDay,
  onSlot,
  onManual,
  onKeep,
  onMove,
}: {
  row: ClassesAppointment;
  sale: PosSaleView | null;
  /** The venue day the Front desk is showing, and its offset from today. */
  dayYmd: string;
  viewedOffset: number;
  dayOffset: number;
  slots: MoveSlots;
  slotIso: string;
  manual: string;
  chosenIso: string | null;
  timeZone: string;
  locale: string;
  copy: ClassesCopy;
  busy: boolean;
  onDay: (offset: number) => void;
  onSlot: (iso: string) => void;
  onManual: (value: string) => void;
  onKeep: () => void;
  onMove: () => void;
}) {
  const m = copy.board.move;
  const name = row.customerName ?? copy.today.nobody;
  const oldClock = formatClock(row.startsAt, timeZone, locale);
  const days = [0, 1, 2].map((n) => dayChip(dayYmd, n, locale));
  const ready = slots.status === "ready" ? slots : null;
  const person = ready?.personName ?? null;
  const length = ready?.durationMinutes ?? (row.endsAt ? Math.round((Date.parse(row.endsAt) - Date.parse(row.startsAt)) / 60_000) : null);
  const endOf = (iso: string) => (length ? formatClock(new Date(Date.parse(iso) + length * 60_000).toISOString(), timeZone, locale) : null);
  const newLine = chosenIso ? `${formatWhen(chosenIso, timeZone, locale)}${endOf(chosenIso) ? `–${endOf(chosenIso)}` : ""}${person ? ` · ${person}` : ""}` : m.newNone;

  return (
    <PosSheet
      title={fill(m.title, { name })}
      subtitle={fill(m.subtitle, { time: oldClock })}
      onClose={onKeep}
      closeLabel={copy.reschedule.cancel}
      attrs={{ "data-pos-classes-move-sheet": row.id }}
      footer={
        <>
          <PosAction onClick={onKeep} disabled={busy}>
            {fill(m.keep, { time: formatWhen(row.startsAt, timeZone, locale) })}
          </PosAction>
          <PosAction tone="primary" size="lg" disabled={busy || !chosenIso} onClick={onMove} testAttr={{ "data-pos-classes-move-submit": row.id }}>
            {busy ? copy.reschedule.submitting : chosenIso ? fill(m.moveTo, { time: formatWhen(chosenIso, timeZone, locale) }) : m.moveNone}
          </PosAction>
        </>
      }
    >
      <PosSegmented<string>
        label={m.days}
        value={String(dayOffset - viewedOffset)}
        onChange={(id) => onDay(viewedOffset + Number(id))}
        size="lg"
        options={days}
      />

      {slots.status === "loading" ? <p className="m-0 font-admin-body text-[14px] text-admin-ink-muted">{m.loading}</p> : null}
      {slots.status === "empty" ? <ClassesNotice kind="refused">{slots.sentence}</ClassesNotice> : null}
      {ready ? (
        <div className="grid grid-cols-4 gap-[10px]" data-pos-classes-move-slots>
          {ready.starts.map((iso) => {
            const on = slotIso === iso;
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={on}
                data-pos-classes-move-slot={iso}
                className={cn(
                  "cursor-pointer rounded-[12px] border-[1.5px] p-[12px] text-left font-admin-body",
                  on ? "border-admin-brand bg-admin-brand-soft" : "border-admin-border bg-admin-card hover:border-admin-border-strong",
                )}
                onClick={() => onSlot(iso)}
              >
                <span className="block text-[17px] font-bold tabular-nums leading-[1.2] text-admin-ink">{formatClock(iso, timeZone, locale)}</span>
                <span className="block truncate text-[13px] leading-[1.2] text-admin-ink-muted">{person ? fill(m.withPerson, { name: person }) : endOf(iso) ?? ""}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <label className="flex flex-col gap-[6px]">
        <span className={POS_LABEL}>{m.anotherTime}</span>
        <input type="datetime-local" className={POS_FIELD} value={manual} onChange={(event) => onManual(event.target.value)} data-pos-classes-move-input />
        <span className={POS_HINT}>{fill(m.anotherTimeHint, { zone: timeZone })}</span>
      </label>

      <div className={cn(POS_CARD, "px-[16px] py-[12px]")}>
        <PosFact label={m.new} muted={!chosenIso}>
          {newLine}
        </PosFact>
        <PosFact label={m.price} muted={!sale}>
          {sale ? fill(m.priceUnchanged, { amount: formatOrderMoney(sale.totalCents, sale.currency) }) : m.priceNone}
        </PosFact>
        <PosFact label={m.deposit} muted={!sale || sale.depositPaidCents <= 0}>
          {sale && sale.depositPaidCents > 0 ? fill(m.depositStays, { amount: formatOrderMoney(sale.depositPaidCents, sale.currency) }) : m.depositNone}
        </PosFact>
        <PosFact label={m.policy} muted>
          {m.policyOff}
        </PosFact>
        <PosFact label={m.oldSlot}>{m.oldSlotRule}</PosFact>
      </div>
    </PosSheet>
  );
}
