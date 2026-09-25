"use client";

import { useState, useTransition } from "react";
import { TALENT_AGENDA_VARS } from "./primitives";
import { createPaymentLink } from "@/lib/server-actions/pos-engine";

/**
 * T8.1 Pay-request composer.
 * Talent enters an amount and we mint a Stripe payment link via POS engine.
 */
export function AgendaPayRequest({
  orderId,
  onClose,
  onLinkCreated,
}: {
  orderId?: string;
  onClose: () => void;
  onLinkCreated?: (url: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const cents = Math.round(parseFloat(amount || "0") * 100);
  const canSend = cents > 0 && !!orderId;

  function handleSend() {
    if (!orderId || cents <= 0) return;
    setResult(null);
    start(async () => {
      const res = await createPaymentLink({
        orderId,
        amountCents: cents,
        idempotencyKey: `agenda-pay-req-${orderId}-${cents}`,
      });
      if ("ok" in res && res.ok) {
        const url = (res as unknown as { url: string }).url ?? "";
        setResult({ url });
        onLinkCreated?.(url);
      } else {
        const reason = "reason" in res ? String(res.reason) : "unknown";
        setResult({ error: `Failed: ${reason}` });
      }
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[480px] space-y-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close pay request"
        className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
      >
        ← Back
      </button>
      <h1 className="text-[22px] font-semibold text-[var(--tc-primary)]">Request payment</h1>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          <span className="mb-1 block font-semibold text-[var(--tc-primary)]">Amount (USD)</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 250.00"
            aria-label="Payment amount in USD"
            className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
          />
        </label>
        {!orderId && (
          <p className="text-[12px] text-[#B42318]">
            No order attached — payment links require a booking or POS order.
          </p>
        )}
      </section>

      {result?.url && (
        <div className="rounded-xl bg-[rgba(31,122,76,0.08)] p-3 text-[13px]">
          <p className="font-semibold text-[#1F7A4C]">Link created ✓</p>
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="break-all text-[var(--tc-accent)] underline"
          >
            {result.url}
          </a>
        </div>
      )}

      {result?.error && (
        <p className="text-[13px] text-[#B42318]" aria-live="polite">{result.error}</p>
      )}

      <button
        type="button"
        disabled={!canSend || pending}
        onClick={handleSend}
        aria-label="Send payment request"
        className="min-h-[44px] w-full rounded-xl bg-[var(--tc-primary)] text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Creating link…" : "Send request"}
      </button>
    </div>
  );
}
