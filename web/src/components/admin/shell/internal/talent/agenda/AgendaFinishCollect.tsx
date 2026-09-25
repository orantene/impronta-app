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
 * T8.2 / G2.1 / G3.4 / A0.4 / A1.1 Finish and collect inside TaskShell.
 * No adjust-lines UI until a real writer exists (A0.4).
 * Card mints a pay link; server creates an order shell when the booking has none.
 */
export function AgendaFinishCollect({
  bookingId,
  orderId: _orderId,
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
  const [method, setMethod] = useState<CollectMethod>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);

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
        // dueCents may be missing when the bridge item was stubbed; the server
        // re-reads total_client_revenue via service role after ownership check.
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const link = await createAgendaBookingPayLink({
          bookingId,
          amountCents: dueCents && dueCents > 0 ? dueCents : undefined,
          publicOrigin: origin,
        });
        if (!link.ok) {
          if (link.reason === "invalid_amount") {
            setResult(copy.t("Card needs an amount due"));
            return;
          }
          setResult(`${copy.t("Could not create pay link")}: ${link.reason}`);
          return;
        }
        setPayUrl(link.url);
      }

      const res = await completeBooking({ bookingId });
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
        // Card keeps the sheet open so the pay link stays visible.
        if (method !== "card") onDone?.();
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
      onPrimaryAction={method ? handleFinish : undefined}
      secondaryActionLabel={copy.t("Back")}
    >
      <div className="space-y-4">
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
          {method === "card" ? (
            <p className="text-[13px] text-[#5F6368]">
              {copy.t("Creates a pay link you can open or send. Works even without a prior order.")}
            </p>
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
          <p
            aria-live="polite"
            className={`text-center text-[13px] ${result.includes("✓") ? "text-[#1F7A4C]" : "text-[#B42318]"}`}
          >
            {result}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
