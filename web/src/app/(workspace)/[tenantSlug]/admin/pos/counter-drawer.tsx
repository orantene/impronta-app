"use client";

/**
 * CounterDrawer — the `Cash` rail target, wired: `openShift` with the
 * counted float, `closeShift` with the counted total, and the result the
 * engine returns (expected cash, and the variance it computed from the
 * shift's own money rows).
 *
 * A TYPED BOX THAT IS EMPTY IS NOT ZERO. `openShift` accepts 0 as a real
 * float, so `parseCashBox` returning `null` (nothing typed, or not a money
 * figure) becomes a refusal the operator sees, never a silent 0 sent to the
 * engine as if the drawer had been counted and found empty.
 *
 * The denomination steppers and the typed total feed ONE figure: a stepper
 * rewrites the typed box from the counts, and typing overrides the steppers.
 */

import { useState } from "react";

import { CashDrawerScreen, type CashDrawerCopy, type CashDrawerView, type PosRefusalReason } from "@/components/admin/pos";

import { keypadNext, parseCashBox, toShiftSummary, type PosShiftView } from "./counter-model";
import { posCloseShift, posOpenShift } from "./actions";

/** Notes and coins a till counts, in major units, largest first. */
function denominationsFor(currency: string): readonly number[] {
  switch (currency.toUpperCase()) {
    case "USD":
    case "CAD":
    case "AUD":
      return [100, 50, 20, 10, 5, 1];
    case "EUR":
    case "GBP":
      return [100, 50, 20, 10, 5];
    default:
      return [1000, 500, 200, 100, 50, 20];
  }
}

export type CounterDrawerProps = {
  readonly shift: PosShiftView | null;
  readonly currency: string;
  readonly minorUnitDivisor: number;
  readonly cashierName: string;
  readonly busy: boolean;
  readonly run: <T extends { ok: boolean }>(kind: "sale" | "shift", fn: () => Promise<T>) => Promise<T>;
  readonly onRefuse: (reason: PosRefusalReason) => void;
  readonly copy: CashDrawerCopy;
};

export function CounterDrawer(props: CounterDrawerProps) {
  const { currency, minorUnitDivisor } = props;
  const [view, setView] = useState<CashDrawerView>(props.shift ? "movements" : "open");
  const [openingCash, setOpeningCash] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [countedCash, setCountedCash] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<{ expectedCents: number; countedCents: number } | null>(null);

  const denominations = denominationsFor(currency);
  const openingCents = parseCashBox(openingCash, minorUnitDivisor);
  const countedCents = parseCashBox(countedCash, minorUnitDivisor);

  // The screen follows the shift: a shift that appeared (opened here, or by
  // another till) moves off the open form; one that vanished moves back.
  const effectiveView: CashDrawerView =
    view === "closed" && result ? "closed" : !props.shift ? "open" : view === "open" ? "movements" : view;

  const keyInto = (current: string, key: string): string => {
    const cents = parseCashBox(current, minorUnitDivisor) ?? 0;
    const next = key === "00" ? keypadNext(keypadNext(cents, "0"), "0") : keypadNext(cents, key);
    return (next / minorUnitDivisor).toFixed(minorUnitDivisor === 1 ? 0 : 2);
  };

  return (
    <CashDrawerScreen
      view={effectiveView}
      onViewChange={(next) => {
        if (next === "open") setResult(null);
        setView(next);
      }}
      shift={toShiftSummary(props.shift)}
      currency={currency}
      cashierName={props.cashierName}
      busy={props.busy}
      openingCash={openingCash}
      onOpeningCashChange={setOpeningCash}
      onOpeningKey={(key) => setOpeningCash((current) => keyInto(current, key))}
      openingCents={openingCents}
      onOpenShift={() => {
        if (openingCents === null) {
          props.onRefuse("amountInvalid");
          return;
        }
        void props.run("shift", () => posOpenShift(openingCents)).then((r) => {
          if (r.ok) {
            setView("movements");
            setOpeningCash("");
          }
        });
      }}
      denominations={denominations}
      counts={counts}
      onCountChange={(denomination, count) => {
        const next = { ...counts, [denomination]: count };
        setCounts(next);
        const total = denominations.reduce((sum, d) => sum + d * (next[d] ?? 0), 0);
        setCountedCash(total.toFixed(minorUnitDivisor === 1 ? 0 : 2));
      }}
      countedCash={countedCash}
      onCountedCashChange={setCountedCash}
      countedCents={countedCents}
      confirmed={confirmed}
      onConfirmedChange={setConfirmed}
      onCloseShift={() => {
        if (countedCents === null) {
          props.onRefuse("amountInvalid");
          return;
        }
        void props
          .run("shift", () => posCloseShift({ closingCashCents: countedCents, expectedVersion: props.shift?.version }))
          .then((r) => {
            if (r.ok && "shift" in r) {
              setResult({
                expectedCents: r.shift.expectedCashCents ?? 0,
                countedCents: r.shift.closingCashCents ?? countedCents,
              });
              setView("closed");
              setCounts({});
              setCountedCash("");
              setConfirmed(false);
            }
          });
      }}
      result={result}
      copy={props.copy}
    />
  );
}
