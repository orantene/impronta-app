"use client";

/**
 * LineEditSheet — `POSLineEdit`: `Latte × 2` / `Not sent · $90 each`, a
 * quantity stepper beside Options, two notes, Served by, Price each, the
 * line total, `Line discount · Duplicate · Remove line`, and a footer with
 * `Cancel`, the `Unsaved changes` flag and `Save changes`.
 *
 * WHAT IS WIRED. Quantity (saved through `onSave`), `Duplicate` (a second
 * line of the same offering and session) and `Remove line` are the engine's
 * own commands. Options, the two notes, Served by and Line discount have no
 * line-level writer yet, so each is drawn disabled with its sentence
 * (D-POS-16); the price is read-only because changing it needs a manager the
 * counter cannot ask yet (D-POS-17).
 */

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { PosSheet } from "./PosSheet";
import {
  POS_DANGER_ACTION,
  POS_INPUT,
  POS_LABEL,
  POS_NUM,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
} from "./pos-classes";
import type { PosBasketLine } from "./pos-types";

export type LineEditCopy = {
  /** `{name} × {count}` */
  readonly title: string;
  readonly notSent: string;
  readonly sent: string;
  /** `{amount} each` */
  readonly each: string;
  readonly quantity: string;
  readonly decrease: string;
  readonly increase: string;
  readonly options: string;
  readonly optionsUnavailable: string;
  readonly noteBar: string;
  readonly noteReceipt: string;
  readonly notesUnavailable: string;
  readonly servedBy: string;
  readonly servedByUnavailable: string;
  readonly priceEach: string;
  readonly listPrice: string;
  readonly priceLocked: string;
  readonly lineTotal: string;
  readonly lineDiscount: string;
  readonly lineDiscountUnavailable: string;
  readonly duplicate: string;
  readonly remove: string;
  readonly cancel: string;
  readonly unsaved: string;
  readonly save: string;
  readonly closeLabel: string;
};

export type LineEditSheetProps = {
  readonly line: PosBasketLine | null;
  readonly currency: string;
  readonly onClose: () => void;
  readonly onSave: (lineId: string, units: number) => void;
  readonly onDuplicate: (lineId: string) => void;
  readonly onRemove: (lineId: string) => void;
  readonly busy?: boolean;
  readonly copy: LineEditCopy;
};

const FIELD_DISABLED = "text-[14px] text-admin-ink-dim";

export function LineEditSheet({ line, currency, onClose, onSave, onDuplicate, onRemove, busy, copy }: LineEditSheetProps) {
  // Keyed on the line id by the caller (see `LineEditSheetHost`), so the
  // draft quantity starts fresh for every line that opens.
  const [units, setUnits] = useState(line?.units ?? 1);
  if (!line) return null;
  const dirty = units !== line.units;
  const total = line.unitCents * units + (line.addonCents ?? 0);
  const detail = [line.variantLabel, line.sessionLabel].filter(Boolean).join(" · ");

  return (
    <PosSheet
      open
      name="line-edit"
      title={interpolate(copy.title, { name: line.label, count: units })}
      subtitle={`${line.locked ? copy.sent : copy.notSent} · ${interpolate(copy.each, { amount: formatOrderMoney(line.unitCents, currency) })}`}
      closeLabel={copy.closeLabel}
      onClose={onClose}
      footerStart={
        <button type="button" onClick={onClose} className={POS_SECONDARY_ACTION}>
          {copy.cancel}
        </button>
      }
      footerEnd={
        <>
          {dirty && <span className="text-[13px] font-semibold text-admin-coral-deep">{copy.unsaved}</span>}
          <button
            type="button"
            data-pos-line-save
            disabled={!dirty || busy || line.locked}
            onClick={() => onSave(line.id, units)}
            className={cn(POS_PRIMARY_ACTION, "h-14")}
          >
            {copy.save}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-4">
        <div>
          <span className={POS_LABEL}>{copy.quantity}</span>
          <div className="flex h-[52px] items-center overflow-hidden rounded-[12px] border-[1.5px] border-admin-border bg-admin-card">
            <button
              type="button"
              aria-label={copy.decrease}
              disabled={units <= 1 || line.locked}
              onClick={() => setUnits((u) => Math.max(1, u - 1))}
              className="inline-flex h-full w-14 items-center justify-center border-r border-admin-border text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40"
            >
              <Minus aria-hidden size={18} strokeWidth={2} />
            </button>
            <span data-pos-line-units className={cn("flex-1 text-center text-[18px] font-semibold text-admin-ink", POS_NUM)}>
              {units}
            </span>
            <button
              type="button"
              aria-label={copy.increase}
              disabled={line.locked}
              onClick={() => setUnits((u) => u + 1)}
              className="inline-flex h-full w-14 items-center justify-center border-l border-admin-border text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40"
            >
              <Plus aria-hidden size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div>
          <span className={POS_LABEL}>{copy.options}</span>
          <input className={POS_INPUT} disabled value={detail} readOnly title={copy.optionsUnavailable} aria-describedby="pos-line-options-why" />
          <p id="pos-line-options-why" className={cn("m-0 mt-1.5", FIELD_DISABLED)}>
            {copy.optionsUnavailable}
          </p>
        </div>
        <div>
          <label className={POS_LABEL} htmlFor="pos-line-note-bar">
            {copy.noteBar}
          </label>
          <input id="pos-line-note-bar" className={POS_INPUT} disabled value={line.notes ?? ""} readOnly title={copy.notesUnavailable} />
        </div>
        <div>
          <label className={POS_LABEL} htmlFor="pos-line-note-receipt">
            {copy.noteReceipt}
          </label>
          <input id="pos-line-note-receipt" className={POS_INPUT} disabled value="" readOnly title={copy.notesUnavailable} />
          <p className={cn("m-0 mt-1.5", FIELD_DISABLED)}>{copy.notesUnavailable}</p>
        </div>
        <div>
          <span className={POS_LABEL}>{copy.servedBy}</span>
          <input className={POS_INPUT} disabled value="" readOnly title={copy.servedByUnavailable} />
          <p className={cn("m-0 mt-1.5", FIELD_DISABLED)}>{copy.servedByUnavailable}</p>
        </div>
        <div>
          <span className={POS_LABEL}>{copy.priceEach}</span>
          <input
            className={POS_INPUT}
            disabled
            readOnly
            value={`${formatOrderMoney(line.unitCents, currency)} · ${copy.listPrice}`}
            title={copy.priceLocked}
          />
          <p className={cn("m-0 mt-1.5", FIELD_DISABLED)}>{copy.priceLocked}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-[12px] border-[1.5px] border-admin-border px-4 py-4">
        <span className="text-[16px] font-semibold text-admin-ink">{copy.lineTotal}</span>
        <span data-pos-line-total className={cn("text-[18px] font-bold text-admin-ink", POS_NUM)}>
          {formatOrderMoney(total, currency)}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled title={copy.lineDiscountUnavailable} className={POS_SECONDARY_ACTION}>
          {copy.lineDiscount}
          <span className="sr-only">{copy.lineDiscountUnavailable}</span>
        </button>
        <button type="button" data-pos-line-duplicate disabled={busy} onClick={() => onDuplicate(line.id)} className={POS_SECONDARY_ACTION}>
          {copy.duplicate}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          data-pos-line-remove
          disabled={busy || line.locked}
          onClick={() => onRemove(line.id)}
          className={POS_DANGER_ACTION}
        >
          {copy.remove}
        </button>
      </div>
      <p className={cn("m-0 mt-2 text-right", FIELD_DISABLED)}>{copy.lineDiscountUnavailable}</p>
    </PosSheet>
  );
}
