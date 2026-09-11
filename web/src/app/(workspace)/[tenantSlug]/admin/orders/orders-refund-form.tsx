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
 */

import { useState } from "react";
import { REFUND_EFFECTS, type RefundEffect } from "@/lib/orders/refund-effects";
import type { RefundDeskOutcome } from "@/lib/orders/refund-desk-copy";
import { loadOrderLinesForDesk, refundOrderAtDesk } from "./refund-actions";

export type RefundFormCopy = {
  readonly refund: string;
  readonly effect: string;
  readonly confirm: string;
  /** One sentence per effect, in the reader's language. */
  readonly effects: Readonly<Record<RefundEffect, string>>;
  /** One sentence per outcome, success included. */
  readonly outcomes: Readonly<Record<RefundDeskOutcome, string>>;
};

export function OrdersRefundForm({
  orderId,
  copy,
}: {
  orderId: string;
  copy: RefundFormCopy;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Array<{ id: string; name: string; totalCents: number }>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [effect, setEffect] = useState<RefundEffect>("cancel_ticket");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RefundDeskOutcome | null>(null);

  async function openForm() {
    setOpen(true);
    setOutcome(null);
    const res = await loadOrderLinesForDesk(orderId);
    if (!res.ok) {
      setOutcome(res.outcome);
      return;
    }
    setLines(res.lines.filter((l) => l.totalCents > l.refundedCents));
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
            setBusy(true);
            void refundOrderAtDesk({ orderId, lineIds: picked, effect }).then((r) => {
              setBusy(false);
              setOutcome(r.outcome);
              // The form stays OPEN on a refusal so the sentence stays on
              // screen next to the lines it is about. It used to close on
              // success only, which was right, and leave a bare code behind on
              // a refusal, which was not.
              if (r.ok) setOpen(false);
            });
          }}
          style={{ display: "grid", gap: 8, maxWidth: 320 }}
        >
          {lines.map((line) => (
            <label key={line.id} style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={picked.includes(line.id)}
                onChange={(e) => {
                  setPicked((cur) =>
                    e.target.checked ? [...cur, line.id] : cur.filter((id) => id !== line.id),
                  );
                }}
              />{" "}
              {line.name}
            </label>
          ))}
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
