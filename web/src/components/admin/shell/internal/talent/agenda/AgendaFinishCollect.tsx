"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import {
  completeBooking,
  createAgendaBookingPayLink,
  recordBookingCashCollected,
  recordBookingTransferAwaiting,
} from "@/lib/talent-agenda";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";
import { useAgendaCopy } from "./use-agenda-copy";

type CollectMethod = "cash" | "card" | "transfer" | "unpaid";
type Step = "method" | "confirm" | "done";

const METHODS: ReadonlyArray<readonly [CollectMethod, string, string]> = [
  ["cash", "Cash", "Records the cash as received by you. It never goes through a card payout."],
  ["card", "Card", "Creates a pay link you can open or send. Works even without a prior order."],
  ["transfer", "Transfer", "Marks transfer awaiting. Confirm when the money lands."],
  ["unpaid", "Not paid yet", "Completes the booking and keeps it unpaid."],
];

/**
 * T8.2 / G2.1 / G3.4 / A0.4 / A1.1 Finish and collect as a stepped panel over
 * the booking record (mockup tc_finish, tc_pay_*): choose how it was paid,
 * confirm, done. Right drawer on desktop, bottom sheet on a phone.
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
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<CollectMethod | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const amountLabel = dueCents && dueCents > 0 ? formatOfferingPrice(dueCents, "MXN", copy.locale) : null;
  const stepNo = step === "method" ? 1 : step === "confirm" ? 2 : 3;
  const chosen = METHODS.find(([id]) => id === method);

  // Once the booking is completed, closing the panel refreshes the record.
  function leave() {
    if (step === "done" && onDone) onDone();
    else onClose();
  }

  function handleConfirm() {
    if (!method) return;
    setError(null);
    setPayUrl(null);
    start(async () => {
      if (method === "cash") {
        const cash = await recordBookingCashCollected({ bookingId });
        if (!cash.ok) {
          setError(`${copy.t("Could not record cash")}: ${cash.reason}`);
          return;
        }
      } else if (method === "transfer") {
        const transfer = await recordBookingTransferAwaiting({ bookingId });
        if (!transfer.ok) {
          setError(`${copy.t("Could not mark transfer")}: ${transfer.reason}`);
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
          setError(
            link.reason === "invalid_amount"
              ? copy.t("Card needs an amount due")
              : `${copy.t("Could not create pay link")}: ${link.reason}`,
          );
          return;
        }
        setPayUrl(link.url);
      }

      const res = await completeBooking({ bookingId });
      if (!res.ok) {
        setError(`${copy.t("Could not complete")}: ${res.reason}`);
        return;
      }
      setNote(
        method === "unpaid"
          ? copy.t("Booking completed as unpaid.")
          : method === "cash"
            ? copy.t("Booking completed. Cash recorded with you (no card payout).")
            : method === "transfer"
              ? copy.t("Booking completed. Transfer marked awaiting until you confirm paid.")
              : copy.t("Booking completed. Card link ready. Open it on this phone or send it."),
      );
      setStep("done");
    });
  }

  const primary =
    step === "method"
      ? { label: copy.t("Continue"), run: method ? () => setStep("confirm") : undefined }
      : step === "confirm"
        ? { label: pending ? copy.t("Completing…") : copy.t("Confirm and complete"), run: pending ? undefined : handleConfirm }
        : { label: copy.t("Done"), run: leave };

  return (
    <TaskShell
      open
      panel
      onClose={leave}
      title={copy.t("Finish and collect")}
      subtitle={`${copy.t("Step")} ${stepNo} ${copy.t("of")} 3`}
      primaryActionLabel={primary.label}
      onPrimaryAction={primary.run}
      secondaryActionLabel={step === "confirm" ? copy.t("Back") : step === "done" ? copy.t("Close") : copy.t("Cancel")}
      onSecondaryAction={step === "confirm" ? () => setStep("method") : leave}
    >
      <div className="space-y-4">
        {step === "method" ? (
          <section className="space-y-2" role="radiogroup" aria-label={copy.t("How was it paid?")}>
            <h3 className="text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("How was it paid?")}</h3>
            {METHODS.map(([id, label]) => (
              <label
                key={id}
                className="flex min-h-[48px] items-center gap-3 rounded-xl border border-black/10 bg-white px-3 text-[14px]"
              >
                <input type="radio" name="collect-method" checked={method === id} onChange={() => setMethod(id)} />
                {copy.t(label)}
              </label>
            ))}
            {!method ? (
              <p className="text-[13px] text-[var(--tc-muted)]">{copy.t("Continue stays off until a method is selected.")}</p>
            ) : chosen ? (
              <p className="text-[13px] text-[var(--tc-muted)]">{copy.t(chosen[2])}</p>
            ) : null}
          </section>
        ) : null}

        {step === "confirm" && chosen ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-black/10 bg-white p-4 text-[14px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--tc-muted)]">{copy.t("Payment method")}</span>
                <span className="font-semibold text-[var(--tc-primary)]">{copy.t(chosen[1])}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-[var(--tc-muted)]">{copy.t("Amount due")}</span>
                <span className="font-semibold text-[var(--tc-primary)]">{amountLabel ?? copy.t("Amount not set")}</span>
              </div>
            </div>
            <p className="text-[13px] text-[var(--tc-muted)]">{copy.t(chosen[2])}</p>
            <p className="text-[13px] text-[var(--tc-muted)]">
              {copy.t("Confirming marks the booking completed. Nothing else changes until you confirm.")}
            </p>
          </section>
        ) : null}

        {step === "done" ? (
          <section className="space-y-3" aria-live="polite">
            <p className="text-[15px] font-semibold text-[var(--tc-ok)]">{copy.t("Finished and collected")}</p>
            {note ? <p className="text-[13.5px] text-[var(--tc-primary)]">{note}</p> : null}
            {payUrl ? (
              <div className="space-y-2 rounded-xl border border-black/10 bg-white p-3 text-[13px]">
                <p className="font-semibold text-[var(--tc-primary)]">{copy.t("Pay link ready")}</p>
                <a href={payUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--tc-accent)] underline">
                  {payUrl}
                </a>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(payUrl).then(
                        () => setCopied(true),
                        () => setCopied(false),
                      );
                    }}
                    className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 text-[13px] font-semibold text-[var(--tc-primary)]"
                  >
                    {copied ? copy.t("Link copied") : copy.t("Copy link")}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-[var(--tc-risk)]">
            {error}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
