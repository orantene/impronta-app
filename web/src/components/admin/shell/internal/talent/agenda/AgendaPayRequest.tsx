"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import { createPaymentLink } from "@/lib/server-actions/pos-engine";
import {
  agendaPayRequestKey,
  newPaymentRequestAttemptId,
} from "@/lib/payments/payment-request-attempt";
import { PayQrPopover } from "./AgendaPayQr";
import { useAgendaCopy } from "./use-agenda-copy";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";

/**
 * T8.1 / G3.4 Request payment as a panel (mockup mc_req_amount, mc_req_created,
 * mc_req_qr): amount, then the real link the writer minted with Copy, WhatsApp
 * and a QR popover that can be downloaded. Success only shows once
 * createPaymentLink returns a url.
 */
export function AgendaPayRequest({
  orderId,
  onClose,
  onLinkCreated,
  defaultCents,
  clientName,
}: {
  orderId?: string;
  onClose: () => void;
  onLinkCreated?: (url: string) => void;
  /** Prefills the amount (Money passes the balance due). */
  defaultCents?: number | null;
  clientName?: string;
}) {
  const copy = useAgendaCopy();
  const [amount, setAmount] = useState(defaultCents && defaultCents > 0 ? (defaultCents / 100).toFixed(2) : "");
  const [result, setResult] = useState<{ url?: string; cents?: number; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const cents = Math.round(parseFloat(amount || "0") * 100);
  const canSend = cents > 0 && !!orderId && !pending;
  const created = Boolean(result?.url);

  function handleSend() {
    if (!orderId || cents <= 0) return;
    setResult(null);
    start(async () => {
      const res = await createPaymentLink({
        orderId,
        amountCents: cents,
        idempotencyKey: agendaPayRequestKey({
          orderId,
          amountCents: cents,
          attemptId: newPaymentRequestAttemptId(),
        }),
      });
      const url = "ok" in res && res.ok ? ((res as unknown as { url?: string }).url ?? "") : "";
      if (url) {
        setResult({ url, cents });
        onLinkCreated?.(url);
      } else {
        const reason = "reason" in res ? String(res.reason) : "unknown";
        setResult({ error: `${copy.t("Failed")}: ${reason}` });
      }
    });
  }

  const shareText = result?.url
    ? `${clientName ? `${clientName}, ` : ""}${copy.t("here is the link to pay")}: ${result.url}`
    : "";
  const amountLabel = result?.cents ? formatDashboardMoneyCents(result.cents, "MXN", copy.locale) : undefined;

  return (
    <TaskShell
      open
      panel
      onClose={onClose}
      title={created ? copy.t("Request created") : copy.t("Request payment")}
      subtitle={clientName}
      primaryActionLabel={created ? copy.t("Done") : pending ? copy.t("Creating link…") : copy.t("Send request")}
      onPrimaryAction={created ? onClose : canSend ? handleSend : undefined}
      secondaryActionLabel={created ? copy.t("Close") : copy.t("Cancel")}
    >
      <div className="space-y-4">
        {!created ? (
          <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
            <label className="block text-[13px]">
              <span className="mb-1 block font-semibold text-[var(--tc-primary)]">{copy.t("Amount (MXN)")}</span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 250.00"
                aria-label={copy.t("Amount (MXN)")}
                className="min-h-[44px] w-full rounded-xl border border-black/10 px-3 py-2 text-[14px]"
              />
            </label>
            {!orderId ? (
              <p className="text-[12px] text-[var(--tc-risk)]">
                {copy.t("No order attached. Payment links require a booking or POS order.")}
              </p>
            ) : null}
          </section>
        ) : null}

        {result?.url ? (
          <section className="space-y-3" aria-live="polite">
            <div className="rounded-xl border border-black/10 bg-white p-3 text-[13px]">
              <p className="font-semibold text-[var(--tc-ok)]">{copy.t("Link created ✓")}</p>
              <p className="mt-1 text-[var(--tc-muted)]">{copy.t("Created is not sent. Sending does not mark it paid.")}</p>
              <a href={result.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[var(--tc-accent)] underline">
                {result.url}
              </a>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(result.url ?? "").then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
                className="min-h-[44px] rounded-full border border-black/10 bg-white px-4 text-[13px] font-semibold text-[var(--tc-primary)]"
              >
                {copied ? copy.t("Link copied") : copy.t("Copy link")}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={copy.t("Send on WhatsApp")}
                className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--tc-ok)] px-4 text-[13px] font-semibold text-white"
              >
                {copy.t("Send on WhatsApp")}
              </a>
              <PayQrPopover url={result.url} caption={amountLabel} />
            </div>
          </section>
        ) : null}

        {result?.error ? (
          <p role="alert" className="text-[13px] text-[var(--tc-risk)]">
            {result.error}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
