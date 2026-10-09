"use client";

/**
 * The Orders desk's refund form.
 *
 * WHAT CHANGED AND WHY. Every string this component showed used to come
 * straight off the wire: `"ok"` on success, `"pick a line"` when nothing was
 * ticked, and the engine's reason code otherwise. A cashier who tried to refund
 * a cash sale read the word `refund_refused` — and the sentence that explains
 * it ("collected off-platform, so there is no card charge to reverse; give the
 * money back the way it came in") was written by `computeRefundEligibility` and
 * thrown away two frames earlier. In Spanish and French it was the same English
 * code.
 *
 * So the server hands back an OUTCOME CODE, `refund-desk-copy.ts` names the
 * message key for it, and the page passes this component the already-translated
 * sentences. This file therefore holds no English of its own: every word below
 * comes from `copy`.
 *
 * THE EFFECT DESCRIPTIONS ARE COPY TOO. They were a hardcoded English record
 * here, on the one control that decides whether a seat comes back and whether a
 * ticket still admits. They now come from the same catalogue.
 *
 * TUL-431: an amount field (default = full remaining) so a partial refund such
 * as MX$300 is possible; service orders default to `adjustment_after_service`
 * instead of ticket wording; success refreshes the list so status flips without
 * a manual reload.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deskRefundAmountDefault, parseDeskRefundAmount } from "@/lib/orders/desk-refund-amount";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { REFUND_EFFECTS, type RefundEffect } from "@/lib/orders/refund-effects";
import type { RefundDeskOutcome } from "@/lib/orders/refund-desk-copy";
import { loadOrderLinesForDesk, refundOrderAtDesk } from "./refund-actions";

export type RefundFormCopy = {
  readonly refund: string;
  readonly effect: string;
  readonly confirm: string;
  /** Amount field label (TUL-431). */
  readonly amount: string;
  /** Hint under the amount field, with {max} for the remaining formatted. */
  readonly amountHint: string;
  /** P06: "Split by component share" over a package line. */
  readonly componentShare: string;
  /** One sentence per effect, in the reader's language. */
  readonly effects: Readonly<Record<RefundEffect, string>>;
  /** One sentence per outcome, success included. */
  readonly outcomes: Readonly<Record<RefundDeskOutcome, string>>;
};

export function OrdersRefundForm({
  orderId,
  currency,
  copy,
}: {
  orderId: string;
  currency: string;
  copy: RefundFormCopy;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Array<{ id: string; name: string; totalCents: number; refundedCents: number; components: Array<{ name: string; cents: number }> | null }>>([]);
  const [captureRefundableCents, setCaptureRefundableCents] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [effect, setEffect] = useState<RefundEffect>("adjustment_after_service");
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RefundDeskOutcome | null>(null);

  // Line remaining capped by capture left (gross − fees − refunds). Without the
  // cap, a remainder after a partial asks for more than Stripe will return and
  // the desk shows "más de lo que se cobró" (TUL-469).
  function maxFor(nextPicked: string[], nextLines: typeof lines, captureLeft: number) {
    const lineLeft = nextLines
      .filter((l) => nextPicked.includes(l.id))
      .reduce((sum, l) => sum + Math.max(0, l.totalCents - l.refundedCents), 0);
    return Math.min(lineLeft, Math.max(0, captureLeft));
  }

  const maxCents = maxFor(picked, lines, captureRefundableCents);

  function syncAmountDefault(nextPicked: string[], nextLines: typeof lines, captureLeft: number) {
    const nextMax = maxFor(nextPicked, nextLines, captureLeft);
    setAmountText(nextMax > 0 ? deskRefundAmountDefault(nextMax, currency) : "");
  }

  async function openForm() {
    setOpen(true);
    setOutcome(null);
    setPicked([]);
    setAmountText("");
    setCaptureRefundableCents(0);
    const res = await loadOrderLinesForDesk(orderId);
    if (!res.ok) {
      setOutcome(res.outcome);
      return;
    }
    // A free line ($0 comp) has no money left by definition; it still has a
    // ticket to cancel, so it stays pickable (D-175).
    const next = res.lines.filter((l) => l.totalCents > l.refundedCents || l.totalCents === 0);
    setLines(next);
    setCaptureRefundableCents(res.captureRefundableCents);
    setEffect(res.defaultEffect);
  }

  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => void openForm()} style={{ fontSize: 12 }}>
          {copy.refund}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (picked.length === 0) {
              setOutcome("pick_a_line");
              return;
            }
            const parsed = parseDeskRefundAmount(amountText, currency, maxCents);
            if (!parsed.ok) {
              setOutcome(parsed.reason === "exceeds" ? "exceeds_captured" : "invalid");
              return;
            }
            setBusy(true);
            void refundOrderAtDesk({
              orderId,
              lineIds: picked,
              effect,
              amountCents: parsed.capped ? parsed.cents : null,
            }).then((r) => {
              setBusy(false);
              setOutcome(r.outcome);
              // The form stays OPEN on a refusal so the sentence stays on
              // screen next to the lines it is about. It used to close on
              // success only, which was right, and leave a bare code behind on
              // a refusal, which was not.
              if (r.ok) {
                setOpen(false);
                // Status stayed "Pagado" until a manual reload (TUL-431).
                router.refresh();
              }
            });
          }}
          style={{ display: "grid", gap: 8, maxWidth: 320 }}
        >
          {lines.map((line) => (
            <div key={line.id}>
              <label style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={picked.includes(line.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...picked, line.id]
                      : picked.filter((id) => id !== line.id);
                    setPicked(next);
                    syncAmountDefault(next, lines, captureRefundableCents);
                  }}
                />{" "}
                {line.name}
              </label>
              {line.components && picked.includes(line.id) ? (
                // P06: a package refund splits by component share; the split
                // is the engine's (`packageRefundShare`), shown before the click.
                <ul data-orders-refund-shares={line.id} style={{ fontSize: 11, margin: "2px 0 0 20px", paddingLeft: 12 }}>
                  <li style={{ listStyle: "none", marginLeft: -12 }}>{copy.componentShare}</li>
                  {line.components.map((c) => (
                    <li key={c.name}>
                      {c.name} · {formatOrderMoney(c.cents, currency)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <label style={{ fontSize: 12 }}>
            {copy.amount}
            <input
              type="text"
              inputMode="decimal"
              data-orders-refund-amount=""
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              disabled={picked.length === 0 || maxCents <= 0}
              style={{ display: "block", width: "100%", minHeight: 36 }}
            />
          </label>
          {picked.length > 0 && maxCents > 0 ? (
            <p style={{ fontSize: 11, margin: 0, color: "inherit", opacity: 0.75 }}>
              {copy.amountHint.replace("{max}", formatOrderMoney(maxCents, currency))}
            </p>
          ) : null}
          <label style={{ fontSize: 12 }}>
            {copy.effect}
            <select
              value={effect}
              onChange={(e) => setEffect(e.target.value as RefundEffect)}
              style={{ display: "block", width: "100%", minHeight: 36 }}
            >
              {REFUND_EFFECTS.map((id) => (
                <option key={id} value={id}>
                  {copy.effects[id]}
                </option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: 12, margin: 0 }}>{copy.effects[effect]}</p>
          <button type="submit" disabled={busy} style={{ minHeight: 36 }}>
            {copy.confirm}
          </button>
          {outcome ? (
            <p role="status" data-orders-refund-outcome={outcome} style={{ fontSize: 12, margin: 0 }}>
              {copy.outcomes[outcome]}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
