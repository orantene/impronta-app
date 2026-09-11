"use client";

/**
 * ProjectsLinkPanel — the Projects mode's `Payment link` tab, and the client
 * record's `Send payment link` (W44 → MW08): the counter's own panel over
 * `createPaymentLink` for one order. The key is derived from the order, its
 * version and the amount, so a second tap is the same link; the refusal is
 * the engine's code said through `dashboard.pos.engine.refusal.*`.
 */

import { useState } from "react";

import { PaymentLinkPanel, type PaymentLinkCopy, type PaymentLinkRow } from "@/components/admin/pos/PaymentLinkPanel";
import { createPaymentLink } from "@/lib/server-actions/pos-engine";

export function ProjectsLinkPanel(props: {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly amountCents: number;
  readonly currency: string;
  readonly workspaceName: string;
  readonly provider: "stripe" | "mock";
  readonly links: readonly { code: string; url: string; amountCents: number; status: string; expiresAt: string }[];
  readonly copy: PaymentLinkCopy;
  readonly engineRefusal: Readonly<Record<string, string>>;
  readonly onWritten?: (link: PaymentLinkRow) => void;
  readonly formatWhen?: (iso: string) => string;
}) {
  const [created, setCreated] = useState<PaymentLinkRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const mint = () => {
    if (busy || props.amountCents <= 0) return;
    setBusy(true);
    setRefusal(null);
    void createPaymentLink({ orderId: props.orderId, amountCents: props.amountCents, idempotencyKey: `paylink:${props.orderId}:${props.orderVersion}:${props.amountCents}` })
      .then((r) => {
        if (r.ok) {
          const row: PaymentLinkRow = { code: r.code, url: r.url, amountCents: r.amountCents, status: "open", expiresAt: props.formatWhen ? props.formatWhen(r.expiresAt) : r.expiresAt };
          setCreated(row);
          props.onWritten?.(row);
        } else {
          setRefusal(props.engineRefusal[r.reason] ?? props.engineRefusal.unavailable ?? "");
        }
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-3">
      <PaymentLinkPanel
        amountCents={props.amountCents}
        currency={props.currency}
        workspaceName={props.workspaceName}
        provider={props.provider}
        links={props.links}
        created={created}
        busy={busy}
        onCreate={mint}
        copy={props.copy}
      />
      {refusal && (
        <p role="alert" data-pos-payment-link-refusal className="m-0 text-[14px] text-admin-red">
          {refusal}
        </p>
      )}
    </div>
  );
}
