"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import {
  completeBooking,
  createAgendaBookingPayLink,
  recordBookingCashCollected,
  recordBookingTransferAwaiting,
} from "@/lib/talent-agenda";
import { useAgendaCopy } from "./use-agenda-copy";

type CollectMethod = "cash" | "card" | "transfer" | "unpaid" | null;

/**
 * T8.2 / G2.1 / G3.4 Finish and collect inside TaskShell.
 */
export function AgendaFinishCollect({
  bookingId,
  orderId,
  dueCents,
  onClose,
  onDone,
}: {
  bookingId: string;
  orderId?: string | null;
  dueCents?: number;
  onClose: () => void;
  onDone?: () => void;
}) {
  const copy = useAgendaCopy();
  const [lines, setLines] = useState<{ label: string; cents: number }[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [method, setMethod] = useState<CollectMethod>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);

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
    setResult(null);
    setPayUrl(null);
    start(async () => {
      if (method === "cash") {
        const cash = await recordBookingCashCollected({ bookingId });
        if (!cash.ok) {
          setResult(`${copy.t("Could not record cash")}: ${cash.reason}`);
          return;
        }
      } else if (method === "transfer") {
        const transfer = await recordBookingTransferAwaiting({ bookingId });
        if (!transfer.ok) {
          setResult(`${copy.t("Could not mark transfer")}: ${transfer.reason}`);
          return;
        }
      } else if (method === "card") {
        if (!orderId) {
          setResult(copy.t("Card needs a linked order"));
          return;
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const link = await createAgendaBookingPayLink({
          bookingId,
          amountCents: dueCents && dueCents > 0 ? dueCents : undefined,
          publicOrigin: origin,
        });
        if (!link.ok) {
          setResult(`${copy.t("Could not create pay link")}: ${link.reason}`);
          return;
        }
        setPayUrl(link.url);
      }

      const res = await completeBooking({ bookingId, adjustLines: lines });
      if (res.ok) {
        const note =
          method === "unpaid"
            ? copy.t("Booking completed as unpaid.")
            : method === "cash"
              ? copy.t("Booking completed. Cash recorded with you (no card payout).")
              : method === "transfer"
                ? copy.t("Booking completed. Transfer marked awaiting until you confirm paid.")
                : copy.t("Booking completed. Card link ready — open it on this phone or send it.");
        setResult(`${note} ✓`);
        onDone?.();
      } else {
        setResult(`${copy.t("Could not complete")}: ${res.reason}`);
      }
    });
  }

  return (
    <TaskShell
      open
      onClose={onClose}
      title={copy.t("Finish and collect")}
      primaryActionLabel={pending ? copy.t("Completing…") : copy.t("Complete booking")}
      onPrimaryAction={method && !(method === "card" && !orderId) ? handleFinish : undefined}
      secondaryActionLabel={copy.t("Back")}
    >
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
          <h2 className="text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Adjust lines")}</h2>
          <p className="text-[13px] text-[#5F6368]">
            {copy.t("Add extras or deductions before closing out.")}
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
                    className="min-h-[44px] text-[#B42318] underline"
                  >
                    {copy.t("Remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder={copy.t("Line description")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              type="number"
              placeholder={copy.t("Amount")}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="min-h-[44px] w-[100px] rounded-xl border border-black/10 px-3 py-2 text-[13px]"
            />
            <button
              type="button"
              onClick={addLine}
              className="min-h-[44px] rounded-xl border border-black/10 px-3 text-[13px]"
            >
              {copy.t("Add")}
            </button>
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-black/8 bg-white p-4">
          <h2 className="text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("How was it paid?")}</h2>
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
              {copy.t(label)}
            </label>
          ))}
          {!method ? (
            <p className="text-[13px] text-[#5F6368]">{copy.t("Complete stays off until a method is selected.")}</p>
          ) : null}
          {method === "card" && !orderId ? (
            <p className="text-[13px] text-[#B42318]">{copy.t("Card needs a linked order")}</p>
          ) : null}
          {method === "transfer" ? (
            <p className="text-[13px] text-[#5F6368]">
              {copy.t("Marks transfer awaiting. Confirm when the money lands.")}
            </p>
          ) : null}
        </section>

        {payUrl ? (
          <div className="rounded-xl bg-[rgba(31,122,76,0.08)] p-3 text-[13px]">
            <p className="font-semibold text-[#1F7A4C]">{copy.t("Pay link ready")}</p>
            <a href={payUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--tc-accent)] underline">
              {payUrl}
            </a>
          </div>
        ) : null}

        {result ? (
          <p aria-live="polite" className={`text-center text-[13px] ${result.includes("✓") ? "text-[#1F7A4C]" : "text-[#B42318]"}`}>
            {result}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
