"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import { createPaymentLink } from "@/lib/server-actions/pos-engine";
import { useAgendaCopy } from "./use-agenda-copy";

/** T8.1 / G3.4 Pay-request composer in TaskShell. */
export function AgendaPayRequest({
  orderId,
  onClose,
  onLinkCreated,
}: {
  orderId?: string;
  onClose: () => void;
  onLinkCreated?: (url: string) => void;
}) {
  const copy = useAgendaCopy();
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
        setResult({ error: `${copy.t("Failed")}: ${reason}` });
      }
    });
  }

  return (
    <TaskShell
      open
      onClose={onClose}
      title={copy.t("Request payment")}
      primaryActionLabel={pending ? copy.t("Creating link…") : copy.t("Send request")}
      onPrimaryAction={canSend ? handleSend : undefined}
      secondaryActionLabel={copy.t("Back")}
    >
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
          <label className="block text-[13px]">
            <span className="mb-1 block font-semibold text-[var(--tc-primary)]">
              {copy.t("Amount (MXN)")}
            </span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 250.00"
              aria-label={copy.t("Amount (MXN)")}
              className="w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
            />
          </label>
          {!orderId ? (
            <p className="text-[12px] text-[#B42318]">
              {copy.t("No order attached — payment links require a booking or POS order.")}
            </p>
          ) : null}
        </section>

        {result?.url ? (
          <div className="rounded-xl bg-[rgba(31,122,76,0.08)] p-3 text-[13px]">
            <p className="font-semibold text-[#1F7A4C]">{copy.t("Link created ✓")}</p>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[var(--tc-accent)] underline"
            >
              {result.url}
            </a>
          </div>
        ) : null}

        {result?.error ? (
          <p className="text-[13px] text-[#B42318]" aria-live="polite">
            {result.error}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
