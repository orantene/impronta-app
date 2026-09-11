"use client";

/**
 * PaymentLinkPanel — the `Payment link` tab of the collect screen, and the
 * `Send payment link` action wherever a sale has a balance (the client
 * collect sheet, the appointment detail): mint the link for what is owed,
 * then show it, copy it, open it in WhatsApp, and say what state it is in.
 *
 * WIRED to `createPaymentLink` (`pos-engine.ts`): the amount is reserved on
 * the sale under the link's own operation key, so the same sale cannot be
 * charged twice while the link is open, and the cron releases a link that
 * lapses. `provider` says the truth about the page behind `/pay/<code>`:
 * Stripe when the workspace has keys, otherwise a test page that marks the
 * link paid when opened.
 */

import { Copy, Link2, MessageCircle } from "lucide-react";
import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { POS_NOTE, POS_NOTE_INFO, POS_NUM, POS_OUTLINE_ACTION, POS_PILL, POS_PILL_CORAL, POS_PILL_GREEN, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_TOTAL_ROW } from "./pos-classes";

export type PaymentLinkRow = {
  readonly code: string;
  readonly url: string;
  readonly amountCents: number;
  /** `open` · `paid` · `expired` · `cancelled` */
  readonly status: string;
  /** Already formatted for the operator's clock. */
  readonly expiresAt: string;
};

export type PaymentLinkCopy = {
  /** `Send a link for {amount}` */
  readonly create: string;
  readonly creating: string;
  readonly providerStripe: string;
  readonly providerMock: string;
  readonly linkTitle: string;
  readonly copyLink: string;
  readonly copied: string;
  readonly whatsapp: string;
  /** `Pay {amount} to {workspace}: {url}` */
  readonly whatsappText: string;
  /** `Expires {when}` */
  readonly expires: string;
  readonly statusOpen: string;
  readonly statusPaid: string;
  readonly statusExpired: string;
  readonly statusCancelled: string;
  readonly nothingOwed: string;
  readonly resendNote: string;
  readonly links: string;
};

export type PaymentLinkPanelProps = {
  readonly amountCents: number;
  readonly currency: string;
  readonly workspaceName: string;
  readonly provider: "stripe" | "mock";
  /** The sale's links, newest first. */
  readonly links: readonly PaymentLinkRow[];
  /** The link this panel just minted, when it did. */
  readonly created: PaymentLinkRow | null;
  readonly busy: boolean;
  readonly onCreate: () => void;
  readonly copy: PaymentLinkCopy;
  readonly className?: string;
};

function statusLabel(copy: PaymentLinkCopy, status: string): string {
  if (status === "paid") return copy.statusPaid;
  if (status === "expired") return copy.statusExpired;
  if (status === "cancelled") return copy.statusCancelled;
  return copy.statusOpen;
}

export function PaymentLinkPanel(props: PaymentLinkPanelProps) {
  const { copy, currency } = props;
  const [copied, setCopied] = useState<string | null>(null);
  const open = props.created ?? props.links.find((l) => l.status === "open") ?? null;
  const money = (cents: number) => formatOrderMoney(cents, currency);
  const whatsapp = (link: PaymentLinkRow) =>
    `https://wa.me/?text=${encodeURIComponent(interpolate(copy.whatsappText, { amount: money(link.amountCents), workspace: props.workspaceName, url: link.url }))}`;

  return (
    <div data-pos-payment-link className={cn("flex flex-col gap-3", props.className)}>
      <p className={POS_NOTE_INFO}>
        <Link2 aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <span>{props.provider === "stripe" ? copy.providerStripe : copy.providerMock}</span>
      </p>
      {open ? (
        <div className="rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{copy.linkTitle}</span>
            <span data-pos-payment-link-status={open.status} className={cn(POS_PILL, open.status === "paid" ? POS_PILL_GREEN : POS_PILL_CORAL)}>
              {statusLabel(copy, open.status)}
            </span>
          </div>
          <a href={open.url} target="_blank" rel="noopener noreferrer" data-pos-payment-link-url className="mt-1.5 block break-all text-[15px] font-semibold text-admin-ink underline">
            {open.url}
          </a>
          <p className={cn("m-0 mt-1 text-[13px] text-admin-ink-muted", POS_NUM)}>
            {money(open.amountCents)} · {interpolate(copy.expires, { when: open.expiresAt })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-pos-payment-link-copy
              onClick={() => {
                void navigator.clipboard?.writeText(open.url).then(
                  () => setCopied(open.code),
                  () => setCopied(null),
                );
              }}
              className={POS_SECONDARY_ACTION}
            >
              <Copy aria-hidden size={16} strokeWidth={1.75} />
              {copied === open.code ? copy.copied : copy.copyLink}
            </button>
            <a href={whatsapp(open)} target="_blank" rel="noopener noreferrer" data-pos-payment-link-whatsapp className={POS_OUTLINE_ACTION}>
              <MessageCircle aria-hidden size={16} strokeWidth={1.75} />
              {copy.whatsapp}
            </a>
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-admin-ink-dim">{copy.resendNote}</p>
        </div>
      ) : props.amountCents <= 0 ? (
        <p role="status" className={POS_NOTE}>
          {copy.nothingOwed}
        </p>
      ) : (
        <button type="button" data-pos-payment-link-create disabled={props.busy} onClick={props.onCreate} className={cn(POS_PRIMARY_ACTION, "w-full")}>
          {props.busy ? copy.creating : interpolate(copy.create, { amount: money(props.amountCents) })}
        </button>
      )}
      {props.links.length > (open && !props.created ? 1 : 0) && (
        <dl className="m-0 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 pb-1 pt-3">
          <p className="m-0 mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{copy.links}</p>
          {props.links.map((link) => (
            <div key={link.code} className={POS_TOTAL_ROW} data-pos-payment-link-row={link.status}>
              <dt className="text-admin-ink-muted">
                {statusLabel(copy, link.status)} · {interpolate(copy.expires, { when: link.expiresAt })}
              </dt>
              <dd className={cn("m-0 font-semibold text-admin-ink", POS_NUM)}>{money(link.amountCents)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
