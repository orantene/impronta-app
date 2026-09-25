"use client";

import { useState, useTransition } from "react";
import { TALENT_AGENDA_VARS } from "./primitives";
import { completeBooking, recordBookingCashCollected } from "@/lib/talent-agenda";

type CollectMethod = "cash" | "card" | "transfer" | "unpaid" | null;

/**
 * T8.2 Finish and collect — mark complete + optional line adjustments.
 * No payment method is preselected. Cash updates payment_status via
 * recordBookingCashCollected; unpaid completes without touching payment.
 */
export function AgendaFinishCollect({
  bookingId,
  onClose,
  onDone,
}: {
  bookingId: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [lines, setLines] = useState<{ label: string; cents: number }[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [method, setMethod] = useState<CollectMethod>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function addLine() {
    const cents = Math.round(parseFloat(newAmount || "0") * 100);
    if (!newLabel.trim() || cents === 0) return;
    setLines((l) => [...l, { label: newLabel.trim(), cents }]);
    setNewLabel("");
    setNewAmount("");
  }

  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx));
  }

  function handleFinish() {
    if (!method) return;
    start(async () => {
      if (method === "cash") {
        const cash = await recordBookingCashCollected({ bookingId });
        if (!cash.ok) {
          setResult(`Could not record cash: ${cash.reason}`);
          return;
        }
      }
      const res = await completeBooking({ bookingId, adjustLines: lines });
      if (res.ok) {
        const note =
          method === "unpaid"
            ? "Booking completed as unpaid."
            : method === "cash"
              ? "Booking completed. Cash recorded with you (no card payout)."
              : method === "transfer"
                ? "Booking completed. Transfer marked awaiting until you confirm paid."
                : "Booking completed. Card path uses the secure pay page.";
        setResult(`${note} ✓`);
        onDone?.();
      } else {
        setResult(`Could not complete: ${res.reason}`);
      }
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[560px] space-y-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close finish collect"
        className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
      >
        ← Back
      </button>
      <h1 className="text-[22px] font-semibold text-[var(--tc-primary)]">Finish and collect</h1>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[14px] font-semibold text-[var(--tc-primary)]">Adjust lines</h2>
        <p className="text-[13px] text-[#5F6368]">
          Add extras or deductions before closing out. Adjustments are recorded on the invoice.
        </p>

        {lines.length > 0 && (
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[13px]">
                <span>{l.label}</span>
                <span className="font-medium">${(l.cents / 100).toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  aria-label={`Remove line: ${l.label}`}
                  className="min-h-[44px] text-[#B42318] underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Line description"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            aria-label="Adjustment label"
            className="min-h-[44px] flex-1 rounded-xl border border-black/10 px-3 py-2 text-[13px]"
          />
          <input
            type="number"
            placeholder="Amount"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            aria-label="Adjustment amount"
            className="min-h-[44px] w-[100px] rounded-xl border border-black/10 px-3 py-2 text-[13px]"
          />
          <button
            type="button"
            onClick={addLine}
            aria-label="Add adjustment line"
            className="min-h-[44px] rounded-xl border border-black/10 px-3 text-[13px]"
          >
            Add
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[14px] font-semibold text-[var(--tc-primary)]">How was it paid?</h2>
        {(
          [
            ["cash", "Cash"],
            ["card", "Card"],
            ["transfer", "Transfer"],
            ["unpaid", "Not paid yet"],
          ] as const
        ).map(([id, label]) => (
          <label key={id} className="flex min-h-[44px] items-center gap-2 text-[14px]">
            <input
              type="radio"
              name="collect-method"
              checked={method === id}
              onChange={() => setMethod(id)}
            />
            {label}
          </label>
        ))}
        {!method ? (
          <p className="text-[13px] text-[#5F6368]">Complete stays off until a method is selected.</p>
        ) : null}
      </section>

      {result && (
        <p aria-live="polite" className={`text-center text-[13px] ${result.includes("✓") ? "text-[#1F7A4C]" : "text-[#B42318]"}`}>
          {result}
        </p>
      )}

      <button
        type="button"
        disabled={pending || !method}
        onClick={handleFinish}
        aria-label="Complete booking"
        className="min-h-[44px] w-full rounded-xl bg-[var(--tc-primary)] text-[14px] font-semibold text-white disabled:opacity-40 mb-[max(8px,env(safe-area-inset-bottom))]"
      >
        {pending ? "Completing…" : "Complete booking"}
      </button>
    </div>
  );
}
