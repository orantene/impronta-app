"use client";

/**
 * FloorDialogs — the two centred cards of the Tables mode.
 *
 * DepartedDialog is T23 "Party left · bill open" (`POSDeparted`). The one
 * thing the engine can do is END THE VISIT, and it refuses in a sentence
 * while the check is unpaid ("Collect or cancel the check before resetting
 * the table"). The board's three ways of freeing a table with a debt on it
 * (keep the bill open in Orders, record another payment method, write the
 * walk-out off) have no writer, so they are drawn disabled over their reason
 * and the primary action is the honest one.
 *
 * ResetDialog is T24 "Table reset" (`POSTableReset`): the bussing checklist
 * (a reminder on the screen, not a record: nothing stores it) and `X is
 * ready`, which is `actions.resetTable`.
 */

import { Check } from "lucide-react";
import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_NOTE_INFO, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosDialog } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { tableCode } from "./floor-model";
import { OPTION_CARD, OPTION_CARD_ACTIVE, OPTION_CARD_OFF } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";
import { moneyFor } from "./FloorViews";

type DialogProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly table: FloorTable;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
};

function Radio({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
        active ? "border-admin-brand bg-admin-brand text-admin-card" : "border-admin-border-strong bg-admin-card",
      )}
    >
      {active && <Check size={12} strokeWidth={3} />}
    </span>
  );
}

export function DepartedDialog(props: DialogProps) {
  const { data, copy, table, busy } = props;
  const d = copy.departed;
  const code = tableCode(table);
  const unpaid = table.orderId ? moneyFor(table, data) : null;
  const options = [
    { id: "keep", title: d.keepOpen, sub: d.keepOpenSub, reason: d.keepOpenReason },
    { id: "other", title: d.paidOther, sub: d.paidOtherSub, reason: d.paidOtherReason },
    { id: "walkout", title: d.walkOut, sub: d.walkOutSub, reason: d.walkOutReason },
  ];
  return (
    <PosDialog
      open={props.open}
      name="party-left"
      title={interpolate(unpaid ? d.title : d.titlePaid, { code })}
      subtitle={unpaid ? interpolate(d.subtitle, { amount: unpaid, min: table.elapsedMinutes ?? 0 }) : interpolate(d.subtitlePaid, { min: table.elapsedMinutes ?? 0 })}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {d.back}
        </button>
      }
      footerEnd={
        <button type="button" data-floor-end-visit className={POS_PRIMARY_ACTION} disabled={busy} onClick={props.onConfirm}>
          {d.confirm}
        </button>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {options.map((o) => (
          <li key={o.id}>
            <button type="button" role="radio" aria-checked={false} disabled title={o.reason} className={cn(OPTION_CARD, OPTION_CARD_OFF)}>
              <Radio active={false} />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold">{o.title}</span>
                <span className="block text-[14px] text-admin-ink-muted">{o.sub}</span>
                <span className="block text-[12.5px] text-admin-ink-muted">{o.reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PosDialog>
  );
}

export function ResetDialog(props: DialogProps) {
  const { data, copy, table, busy } = props;
  const r = copy.reset;
  const code = tableCode(table);
  const [checks, setChecks] = useState({ cleared: true, resetFor: true, candle: false });
  const items: Array<[keyof typeof checks, string]> = [
    ["cleared", r.cleared],
    ["resetFor", interpolate(r.resetFor, { n: table.partyMax })],
    ["candle", r.candle],
  ];
  return (
    <PosDialog
      open={props.open}
      name="table-reset"
      title={interpolate(r.title, { code })}
      subtitle={interpolate(r.subtitle, { time: table.needsResetSinceIso ? venueHhmm(table.needsResetSinceIso, data.timeZone, data.locale) : "" })}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {r.notYet}
        </button>
      }
      footerEnd={
        <button type="button" data-floor-mark-ready className={POS_PRIMARY_ACTION} disabled={busy} onClick={props.onConfirm}>
          {interpolate(r.confirm, { code })}
        </button>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map(([key, label]) => (
          <li key={key}>
            <label className={cn(OPTION_CARD, "cursor-pointer border-transparent px-2 py-2", checks[key] && OPTION_CARD_ACTIVE)}>
              <input type="checkbox" className="sr-only" checked={checks[key]} disabled={busy} onChange={() => setChecks((c) => ({ ...c, [key]: !c[key] }))} />
              <Radio active={checks[key]} />
              <span className="text-[16px] font-medium text-admin-ink">{label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className={cn("m-0 mt-3", POS_NOTE_INFO)}>
        <Check aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        {r.note}
      </p>
    </PosDialog>
  );
}
