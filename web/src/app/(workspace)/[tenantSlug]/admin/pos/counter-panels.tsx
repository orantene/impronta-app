"use client";

/**
 * counter-panels.tsx — the three side panels the counter draws for itself.
 *
 * WHY THEY ARE HERE AND NOT IN `components/admin/pos/`. That directory holds
 * the DESIGN's own screens — the frame, the sell surface, the basket, the
 * collect sheet, the paid screen, the held list, the shift bar. These three
 * are not in that package: the buyer's contact fields, the preparation
 * destination, and the shift open/close form are wiring the counter needs to
 * reach commands the design package does not model. Putting them beside the
 * page keeps the design package a faithful record of the approved screens
 * rather than a drawer for whatever a route turned out to need.
 *
 * WHY THEY ARE NOT INLINE IN `pos-client.tsx`. That file is the wire between
 * every screen and every command, and it crossed the repo's 800-line cap. The
 * honest seam is presentation-with-callbacks versus command dispatch: nothing
 * below calls a server action or holds a refusal, so the file that does can
 * stay readable.
 *
 * Every one of them takes copy as props, like the design package does, so the
 * page resolves the catalogue once and nothing here needs a translator.
 */

import { POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import type { PosRefusalReason, ShiftBarCopy } from "@/components/admin/pos";
import type { PosCounterPageCopy } from "@/components/admin/pos/pos-copy";
import { formatOrderMoney } from "@/lib/orders/money-format";

import { parseCashBox, type PosShiftView } from "./counter-model";

const FIELD = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const FIELD_LABEL = "text-xs font-medium text-muted-foreground";

export type CounterLegacyCopy = {
  readonly contactHint: string;
  readonly email: string;
  readonly phone: string;
  readonly sendToPrep: string;
  readonly prepDestination: string;
  readonly prepPickup: string;
  readonly prepTable: string;
  readonly prepCounter: string;
  readonly prepPromisedAt: string;
};

/**
 * The buyer's contact details.
 *
 * NOT a required step. `startCollection` sells to an anonymous walk-in and
 * the receipt code is that customer's retrieval anchor; what these two fields
 * do is NAME the buyer when there is one, which is what `ensureCustomer`
 * needs to attach an existing customer rather than create a second record for
 * the same person. A line whose offering demands a name refuses the sale on
 * its own (`no_contact`), and that refusal renders as its own sentence.
 */
export function CounterContactFields({
  copy,
  email,
  phone,
  onEmailChange,
  onPhoneChange,
}: {
  readonly copy: CounterLegacyCopy;
  readonly email: string;
  readonly phone: string;
  readonly onEmailChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
}) {
  return (
    <div className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
      <p className="m-0 text-xs text-muted-foreground">{copy.contactHint}</p>
      <label className={FIELD_LABEL} htmlFor="pos-buyer-email">
        {copy.email}
      </label>
      <input
        id="pos-buyer-email"
        type="email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        className={FIELD}
      />
      <label className={FIELD_LABEL} htmlFor="pos-buyer-phone">
        {copy.phone}
      </label>
      <input
        id="pos-buyer-phone"
        type="tel"
        value={phone}
        onChange={(event) => onPhoneChange(event.target.value)}
        className={FIELD}
      />
    </div>
  );
}

export type PrepDestination = "table" | "pickup" | "counter";

/**
 * Where this sale goes to be made, and when it was promised.
 *
 * THE PICKUP WINDOW IS VALIDATED HERE, not in the engine. `posSubmitPrep`
 * refuses a promised time that is not in the future, but a `datetime-local`
 * input hands back a wall-clock string with no zone, so turning it into an
 * instant is the browser's job. `onSubmit` receives `null` when that
 * conversion produced a time that is already past, and the caller turns that
 * into the `pickupWindow` sentence rather than sending the server a moment it
 * will only reject.
 */
export function CounterPrepPanel({
  copy,
  busy,
  destination,
  onDestinationChange,
  promisedAtLocal,
  onPromisedAtChange,
  onSubmit,
}: {
  readonly copy: CounterLegacyCopy;
  readonly busy: boolean;
  readonly destination: PrepDestination;
  readonly onDestinationChange: (value: PrepDestination) => void;
  readonly promisedAtLocal: string;
  readonly onPromisedAtChange: (value: string) => void;
  /** `null` means the typed pickup time is not in the future. */
  readonly onSubmit: (promisedAt: string | null) => void;
}) {
  return (
    <div className={`${POS_SURFACE} flex flex-col gap-2 p-4`}>
      <label className={FIELD_LABEL} htmlFor="pos-prep-destination">
        {copy.prepDestination}
      </label>
      <select
        id="pos-prep-destination"
        value={destination}
        onChange={(event) => onDestinationChange(event.target.value as PrepDestination)}
        className={FIELD}
      >
        <option value="counter">{copy.prepCounter}</option>
        <option value="table">{copy.prepTable}</option>
        <option value="pickup">{copy.prepPickup}</option>
      </select>
      {destination === "pickup" && (
        <>
          <label className={FIELD_LABEL} htmlFor="pos-prep-promised">
            {copy.prepPromisedAt}
          </label>
          <input
            id="pos-prep-promised"
            type="datetime-local"
            value={promisedAtLocal}
            onChange={(event) => onPromisedAtChange(event.target.value)}
            className={FIELD}
          />
        </>
      )}
      <button
        type="button"
        disabled={busy}
        className={`${POS_SECONDARY_ACTION} h-11`}
        onClick={() => {
          if (destination !== "pickup") {
            onSubmit(null);
            return;
          }
          const when = new Date(promisedAtLocal);
          const ahead = !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
          onSubmit(ahead ? when.toISOString() : null);
        }}
      >
        {copy.sendToPrep}
      </button>
    </div>
  );
}

/**
 * The drawer: open a shift with a counted float, close it with a counted
 * total.
 *
 * A TYPED BOX THAT IS EMPTY IS NOT ZERO. `openShift` accepts 0 as a real
 * opening float, so `parseCashBox` returning `null` (nothing typed, or not a
 * money figure) has to become a refusal the operator sees, never a silent 0
 * sent to the engine as if the drawer had been counted and found empty.
 */
export function CounterShiftScreen({
  shift,
  currency,
  minorUnitDivisor,
  busy,
  copy,
  openingCash,
  onOpeningCashChange,
  countedCash,
  onCountedCashChange,
  onRefuse,
  onOpenShift,
  onCloseShift,
}: {
  readonly shift: PosShiftView | null;
  readonly currency: string;
  readonly minorUnitDivisor: number;
  readonly busy: boolean;
  readonly copy: { readonly bar: ShiftBarCopy; readonly page: PosCounterPageCopy };
  readonly openingCash: string;
  readonly onOpeningCashChange: (value: string) => void;
  readonly countedCash: string;
  readonly onCountedCashChange: (value: string) => void;
  readonly onRefuse: (reason: PosRefusalReason) => void;
  readonly onOpenShift: (openingCashCents: number) => void;
  readonly onCloseShift: (closingCashCents: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className={`${POS_SURFACE} flex flex-col gap-3 p-4`}>
        <h2 className="m-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.bar.shiftTitle}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{copy.bar.shiftOpenHint}</p>
        {shift ? (
          <>
            <p className="m-0 text-sm text-foreground">
              {copy.bar.shiftOpening} {formatOrderMoney(shift.openingCashCents, currency)}
            </p>
            <label className={FIELD_LABEL} htmlFor="pos-shift-counted">
              {copy.page.closeShiftCash}
            </label>
            <input
              id="pos-shift-counted"
              inputMode="decimal"
              value={countedCash}
              onChange={(event) => onCountedCashChange(event.target.value)}
              className={FIELD}
            />
            <button
              type="button"
              disabled={busy}
              className={`${POS_PRIMARY_ACTION} w-full`}
              onClick={() => {
                const closingCashCents = parseCashBox(countedCash, minorUnitDivisor);
                if (closingCashCents === null) {
                  onRefuse("amountInvalid");
                  return;
                }
                onCloseShift(closingCashCents);
              }}
            >
              {copy.page.confirmCloseShift}
            </button>
          </>
        ) : (
          <>
            <p className="m-0 text-sm text-foreground">{copy.bar.shiftNone}</p>
            <label className={FIELD_LABEL} htmlFor="pos-shift-opening">
              {copy.page.openShiftCash}
            </label>
            <input
              id="pos-shift-opening"
              inputMode="decimal"
              value={openingCash}
              onChange={(event) => onOpeningCashChange(event.target.value)}
              className={FIELD}
            />
            <button
              type="button"
              disabled={busy}
              className={`${POS_PRIMARY_ACTION} w-full`}
              onClick={() => {
                const openingCashCents = parseCashBox(openingCash, minorUnitDivisor);
                if (openingCashCents === null) {
                  onRefuse("amountInvalid");
                  return;
                }
                onOpenShift(openingCashCents);
              }}
            >
              {copy.page.confirmOpenShift}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
