"use client";

/**
 * W44 — `Collect from <client>`: the header button and the sheet it opens.
 *
 * UNPAID RECORDS are the client's purchases the orders desk says are owed
 * (`unpaidPurchases`); each is a checkbox, the first ticked. ALLOCATION
 * reads the selection back. `Continue to payment` opens the counter on
 * that one record (`/admin/pos?mode=counter&order=<id>`), which is the
 * engine's real door for taking money against a sale.
 *
 * ONE RECORD AT A TIME (D-POS-40). Which unpaid records a single payment
 * applies to is not recorded anywhere in this database, so two ticked
 * records disable the button with the reason instead of inventing an
 * allocation. `Send payment link` mints `/pay/<code>` for the one ticked
 * record (`createPaymentLink`, the counter's own panel) and the record then
 * carries the MW08 line: sent, expires, you will be told when it is paid.
 */

import { useState } from "react";
import { Check } from "lucide-react";

import type { PaymentLinkCopy, PaymentLinkRow } from "@/components/admin/pos/PaymentLinkPanel";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { ProjectsLinkPanel } from "../../pos/_projects/projects-link-panel";
import { BTN_PRIMARY, BTN_SECONDARY, Eyebrow, KeyValue, ListRow, dayLabel } from "../../projects/_shared";
import { RecordSheet } from "../../projects/_sheet";

export type CollectRecordView = {
  orderId: string;
  title: string;
  detail: string;
  owedCents: number;
  currency: string;
};

export type CollectSheetCopy = {
  open: string;
  title: string;
  subtitle: string;
  closeLabel: string;
  unpaid: string;
  allocation: string;
  selected: string;
  selectedRecords: string;
  tip: string;
  tipValue: string;
  pass: string;
  passValue: string;
  receipt: string;
  receiptValue: string;
  note: string;
  cancel: string;
  sendLink: string;
  /** Why the link cannot be sent right now (nothing ticked, or two records). */
  sendLinkUnavailable: string;
  /** MW08: `Payment link sent · expires {when} · you will be notified when paid` */
  linkSent: string;
  continueTo: string;
  oneAtATime: string;
  nothingSelected: string;
};

export function ClientCollect({
  records,
  counterHref,
  copy,
  link,
  className,
}: {
  records: CollectRecordView[];
  /** `/<slug>/admin/pos?mode=counter`; the order id is appended here. */
  counterHref: string;
  copy: CollectSheetCopy;
  /** The payment-link panel's facts and copy. */
  link: {
    workspaceName: string;
    provider: "stripe" | "mock";
    copy: PaymentLinkCopy;
    engineRefusal: Readonly<Record<string, string>>;
    /** The record's own zone and the reader's locale, for the expiry line. */
    timeZone: string;
    locale: string;
    none: string;
  };
  /** The phone's 50px shape when the button rides the fixed bar (MW06). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sent, setSent] = useState<PaymentLinkRow | null>(null);
  const [picked, setPicked] = useState<string[]>(records[0] ? [records[0].orderId] : []);
  const chosen = records.filter((r) => picked.includes(r.orderId));
  const currency = chosen[0]?.currency ?? records[0]?.currency ?? "USD";
  const selectedCents = chosen.reduce((sum, r) => sum + r.owedCents, 0);
  const totalCents = records.reduce((sum, r) => sum + r.owedCents, 0);
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const one = chosen.length === 1 ? chosen[0] : null;

  return (
    <>
      <button type="button" className={className ? `${BTN_PRIMARY} ${className}` : BTN_PRIMARY} onClick={() => setOpen(true)} data-client-collect-open>
        {copy.open} {formatOrderMoney(totalCents, currency)}
      </button>
      {sent && (
        <p role="status" data-client-link-sent className="m-0 flex items-start gap-2 rounded-[10px] bg-admin-success-soft px-3 py-2.5 text-[13px] font-semibold text-admin-success">
          <Check aria-hidden size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          <span>{interpolate(copy.linkSent, { when: sent.expiresAt })}</span>
        </p>
      )}
      <RecordSheet
        open={open}
        name="collect"
        title={copy.title}
        subtitle={copy.subtitle}
        closeLabel={copy.closeLabel}
        onClose={() => setOpen(false)}
        footerStart={
          <button type="button" onClick={() => setOpen(false)} className={BTN_SECONDARY}>
            {copy.cancel}
          </button>
        }
        footerEnd={
          <>
            <button
              type="button"
              disabled={!one}
              title={one ? undefined : copy.sendLinkUnavailable}
              aria-pressed={linkOpen}
              className={BTN_SECONDARY}
              data-client-send-link
              onClick={() => setLinkOpen((v) => !v)}
            >
              {copy.sendLink}
            </button>
            {one ? (
              <a href={`${counterHref}&order=${encodeURIComponent(one.orderId)}`} className={BTN_PRIMARY} data-client-collect-continue>
                {copy.continueTo} · {formatOrderMoney(one.owedCents, one.currency)}
              </a>
            ) : (
              <button type="button" disabled title={chosen.length === 0 ? copy.nothingSelected : copy.oneAtATime} className={BTN_PRIMARY} data-client-collect-continue>
                {copy.continueTo} · {formatOrderMoney(selectedCents, currency)}
              </button>
            )}
          </>
        }
      >
        <Eyebrow>{copy.unpaid}</Eyebrow>
        <div className="rounded-[12px] border border-admin-border bg-admin-card">
          {records.map((r) => {
            const on = picked.includes(r.orderId);
            return (
              <ListRow key={r.orderId} cols="grid-cols-[1.1fr_1.6fr_auto] max-[720px]:grid-cols-[minmax(0,1fr)_auto]" className="border-t">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(r.orderId)} />
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px]",
                      on ? "border-admin-brand bg-admin-brand text-admin-card" : "border-admin-border-strong bg-admin-card",
                    )}
                  >
                    {on ? <Check size={12} strokeWidth={2.5} /> : null}
                  </span>
                  <b className={on ? "text-admin-ink" : "text-admin-ink-muted"}>{r.title}</b>
                </label>
                <span className="text-admin-ink-muted max-[720px]:order-3 max-[720px]:col-span-2 max-[720px]:text-[12.5px]">{r.detail}</span>
                <span className="text-[15px] font-semibold tracking-[-0.02em] tabular-nums">{formatOrderMoney(r.owedCents, r.currency)}</span>
              </ListRow>
            );
          })}
        </div>
        <Eyebrow>{copy.allocation}</Eyebrow>
        <div className="rounded-[12px] border border-admin-border bg-admin-card px-4 py-3">
          <KeyValue
            label={copy.selected}
            value={`${formatOrderMoney(selectedCents, currency)} · ${copy.selectedRecords.replace("{count}", String(chosen.length))}`}
          />
          <KeyValue label={copy.tip} value={copy.tipValue} dim />
          <KeyValue label={copy.pass} value={copy.passValue} dim />
          <KeyValue label={copy.receipt} value={copy.receiptValue} />
        </div>
        <p className="m-0 rounded-[10px] bg-admin-surface-alt px-3 py-2.5 text-[12.5px] text-admin-ink-muted">
          {chosen.length > 1 ? copy.oneAtATime : copy.note}
        </p>
        {linkOpen && one && (
          <>
            <Eyebrow>{copy.sendLink}</Eyebrow>
            <ProjectsLinkPanel
              orderId={one.orderId}
              orderVersion={0}
              amountCents={one.owedCents}
              currency={one.currency}
              workspaceName={link.workspaceName}
              provider={link.provider}
              links={sent ? [sent] : []}
              copy={link.copy}
              engineRefusal={link.engineRefusal}
              formatWhen={(iso) => dayLabel(iso, link.timeZone, link.locale, link.none, { time: true })}
              onWritten={setSent}
            />
          </>
        )}
      </RecordSheet>
    </>
  );
}
