"use client";

/**
 * CounterDrawer — the `Cash` rail target, wired: `openShift` with the
 * counted float, the movements (`posRecordShiftMovement`), the hand-over and
 * the close note carried into `closeShift` with the counted total, and the
 * result the engine returns (expected cash, and the variance it computed
 * from the float, the cash sales and the movements).
 *
 * A TYPED BOX THAT IS EMPTY IS NOT ZERO. `openShift` accepts 0 as a real
 * float, so `parseCashBox` returning `null` (nothing typed, or not a money
 * figure) becomes a refusal the operator sees, never a silent 0 sent to the
 * engine as if the drawer had been counted and found empty.
 *
 * The denomination steppers and the typed total feed ONE figure: a stepper
 * rewrites the typed box from the counts, and typing overrides the steppers.
 *
 * A movement's refusal is the engine's own code (`amount`, `already_closed`,
 * `not_found`, `unavailable`), said in the dialog through the
 * `dashboard.pos.engine.refusal.*` sentences.
 */

import { useState } from "react";

import { CashDrawerScreen, CashMovementDialog, type CashDrawerCopy, type CashDrawerView, type CashMovementCopy, type CashMovementKind, type PosPerson, type PosRefusalReason } from "@/components/admin/pos";
import { posRecordShiftMovement } from "@/lib/server-actions/pos-engine";

import { formatClock, keypadNext, parseCashBox, toShiftSummary, type PosShiftView } from "./counter-model";
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
  readonly locale: string;
  readonly cashierName: string;
  /** The people the drawer can be handed to. */
  readonly people: readonly PosPerson[];
  readonly busy: boolean;
  readonly run: <T extends { ok: boolean }>(kind: "sale" | "shift", fn: () => Promise<T>) => Promise<T>;
  readonly onRefuse: (reason: PosRefusalReason) => void;
  readonly onRefresh: () => void;
  readonly copy: CashDrawerCopy;
  readonly movementCopy: CashMovementCopy;
  readonly engineRefusal: Readonly<Record<string, string>>;
};

export function CounterDrawer(props: CounterDrawerProps) {
  const { currency, minorUnitDivisor } = props;
  const [view, setView] = useState<CashDrawerView>(props.shift ? "movements" : "open");
  const [openingCash, setOpeningCash] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [countedCash, setCountedCash] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [handOverTo, setHandOverTo] = useState<string | null>(null);
  const [countedTogether, setCountedTogether] = useState(false);
  const [result, setResult] = useState<{ expectedCents: number; countedCents: number } | null>(null);
  const [movement, setMovement] = useState<{ kind: CashMovementKind; amountCents: number; reason: string; status: string | null; busy: boolean } | null>(null);

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

  const recordMovement = () => {
    if (!movement || movement.busy) return;
    setMovement({ ...movement, busy: true, status: null });
    void posRecordShiftMovement({ kind: movement.kind, amountCents: movement.amountCents, reason: movement.reason.trim(), shiftId: props.shift?.id }).then((r) => {
      if (r.ok) {
        setMovement(null);
        props.onRefresh();
        return;
      }
      setMovement((m) => (m ? { ...m, busy: false, status: props.engineRefusal[r.reason] ?? props.engineRefusal.unavailable ?? "" } : m));
    });
  };

  return (
    <>
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
            .run("shift", () =>
              posCloseShift({
                closingCashCents: countedCents,
                expectedVersion: props.shift?.version,
                closeNote: closeNote.trim() || undefined,
                handedOverTo: handOverTo ?? undefined,
              }),
            )
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
                setCloseNote("");
                setHandOverTo(null);
                setCountedTogether(false);
              }
            });
        }}
        result={result}
        onMovement={(kind) => setMovement({ kind, amountCents: 0, reason: "", status: null, busy: false })}
        formatTime={(iso) => formatClock(iso, props.locale)}
        people={props.people}
        handOverTo={handOverTo}
        onHandOverToChange={setHandOverTo}
        countedTogether={countedTogether}
        onCountedTogetherChange={setCountedTogether}
        closeNote={closeNote}
        onCloseNoteChange={setCloseNote}
        copy={props.copy}
      />
      {movement && (
        <CashMovementDialog
          open
          kind={movement.kind}
          currency={currency}
          amountCents={movement.amountCents}
          onKey={(key) =>
            setMovement((m) => (m ? { ...m, amountCents: key === "00" ? keypadNext(keypadNext(m.amountCents, "0"), "0") : keypadNext(m.amountCents, key) } : m))
          }
          reason={movement.reason}
          onReasonChange={(reason) => setMovement((m) => (m ? { ...m, reason } : m))}
          status={movement.status}
          busy={movement.busy}
          onClose={() => setMovement(null)}
          onConfirm={recordMovement}
          copy={props.movementCopy}
        />
      )}
    </>
  );
}
