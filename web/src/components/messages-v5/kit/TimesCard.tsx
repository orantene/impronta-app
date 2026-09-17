/**
 * TimesCard (board D09): live slots sent to the client; the pick holds only
 * the time (owner decision 3), staff confirm. Hold ended reads the refusal
 * sentence and offers new times.
 */

import { Card, CardLine } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { Btn, Chip, Pill } from "./primitives";

export type TimesSlot = { readonly id: string; readonly label: string; readonly picked?: boolean; readonly unavailable?: boolean };
export type TimesCardState = "sent" | "picked" | "hold_ended" | "confirmed";
export type TimesCardAction = "confirm" | "offer_new";

export type TimesCardProps = {
  readonly withName: string;
  readonly clientName: string;
  readonly slots: readonly TimesSlot[];
  readonly state: TimesCardState;
  readonly detail?: string | null;
  readonly holdMinutes?: number;
  readonly holdLeft?: string | null;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onPick?: (slotId: string) => void;
  readonly onAction?: (action: TimesCardAction) => void;
};

export function TimesCard({ withName, clientName, slots, state, detail, holdMinutes = 15, holdLeft, copy, busy, variant = "desktop", onPick, onAction }: TimesCardProps) {
  const picked = slots.find((s) => s.picked);
  const pill = state === "picked" ? <Pill tone="opp">{copy.times.picked}</Pill> : state === "confirmed" ? <Pill tone="money">{copy.appt.confirmed}</Pill> : state === "hold_ended" ? <Pill tone="lost">{copy.card.state.expired}</Pill> : <Pill tone="opp">{copy.times.sent}</Pill>;
  const foot =
    state === "picked" && picked
      ? fill(copy.times.pickedHeld, { name: clientName, slot: picked.label, minutes: holdMinutes, left: holdLeft ?? "" })
      : state === "hold_ended"
        ? copy.times.holdEnded
        : state === "sent"
          ? fill(copy.times.waiting, { name: clientName })
          : null;
  const actions =
    onAction && state === "picked" ? (
      <Btn size="sm" variant="primary" busy={busy} onClick={() => onAction("confirm")} data-times-action="confirm">
        {copy.times.confirmTime}
      </Btn>
    ) : onAction && state === "hold_ended" ? (
      <Btn size="sm" onClick={() => onAction("offer_new")} data-times-action="offer_new">
        {copy.times.offerNew}
      </Btn>
    ) : null;
  return (
    <Card category="appt" icon="clock" label={copy.card.cat.times} title={fill(copy.appt.withName, { name: withName })} pills={pill} mine busy={busy} variant={variant} testId="times" foot={foot} actions={actions}>
      <div className="chips">
        {slots.length === 0 ? <span className="who">{copy.times.noSlots}</span> : null}
        {slots.map((s) => (
          <Chip key={s.id} soft={!s.picked} on={s.picked} off={s.unavailable} onClick={onPick && !s.unavailable ? () => onPick(s.id) : undefined}>
            {s.label}
          </Chip>
        ))}
      </div>
      {detail ? <CardLine muted label={detail} /> : null}
    </Card>
  );
}
