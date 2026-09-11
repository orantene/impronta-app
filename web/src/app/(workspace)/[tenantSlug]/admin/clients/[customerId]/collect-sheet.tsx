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
 * allocation. `Send payment link` has no sender (D-POS-27) and says so.
 */

import { useState } from "react";
import { Check } from "lucide-react";

import { formatOrderMoney } from "@/lib/orders/money-format";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY, Eyebrow, KeyValue, ListRow } from "../../projects/_shared";
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
  sendLinkUnavailable: string;
  continueTo: string;
  oneAtATime: string;
  nothingSelected: string;
};

export function ClientCollect({
  records,
  counterHref,
  copy,
}: {
  records: CollectRecordView[];
  /** `/<slug>/admin/pos?mode=counter`; the order id is appended here. */
  counterHref: string;
  copy: CollectSheetCopy;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(records[0] ? [records[0].orderId] : []);
  const chosen = records.filter((r) => picked.includes(r.orderId));
  const currency = chosen[0]?.currency ?? records[0]?.currency ?? "USD";
  const selectedCents = chosen.reduce((sum, r) => sum + r.owedCents, 0);
  const totalCents = records.reduce((sum, r) => sum + r.owedCents, 0);
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const one = chosen.length === 1 ? chosen[0] : null;

  return (
    <>
      <button type="button" className={BTN_PRIMARY} onClick={() => setOpen(true)} data-client-collect-open>
        {copy.open} {formatOrderMoney(totalCents, currency)}
      </button>
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
            <button type="button" disabled title={copy.sendLinkUnavailable} className={BTN_SECONDARY}>
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
              <ListRow key={r.orderId} cols="grid-cols-[1.1fr_1.6fr_auto]" className="border-t">
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
                <span className="text-admin-ink-muted">{r.detail}</span>
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
      </RecordSheet>
    </>
  );
}
