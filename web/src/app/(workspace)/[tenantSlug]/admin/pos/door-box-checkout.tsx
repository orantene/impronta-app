"use client";

/**
 * DoorCheckout — E04 (who is coming), the cash (the counter's own
 * `CollectSheet` in a dialog), then E06 (issued) or E07 (paid, not issued).
 *
 * THE MONEY PATH IS THE COUNTER'S: `posDoorCollectTicket` runs
 * `startCollection` with the derived idempotency key (same sale, version,
 * tender and amount is the same attempt), the mint hook, then names the
 * minted rows with the attendee names typed here, in line order. E07 is the
 * real state of a paid order whose mint wrote no row: `Try issuing again` is
 * the exceptions queue's own verb (`mint_missing_admissions`), re-read
 * through `posDoorIssuedTickets` afterwards, never assumed from the resume's
 * success line.
 */

import { AlertTriangle, Check, QrCode } from "lucide-react";
import { useCallback, useState } from "react";

import { CollectSheet, PosRefusalBanner, initialsOf, type PosCollectionMethodId, type PosCollectionMethodState, type PosRefusalReason } from "@/components/admin/pos";
import { POS_EYEBROW, POS_INPUT, POS_LABEL, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { orderRef, ticketRef } from "@/lib/pos/door-model";
import { refusalFromResult } from "@/lib/pos/refusal-reason";
import { cn } from "@/lib/utils";
import { resumeExceptionAction } from "@/app/(workspace)/[tenantSlug]/admin/_exceptions-actions";

import { posCollectionKey, tenderAfterKey } from "./counter-model";
import { posDoorCollectTicket, posDoorIssuedTickets, type DoorIssuedTicket, type DoorSaleView } from "./door-actions";
import { dateAt, timeAt, type DoorScreenCopy, type OpenDoor } from "./door-shared";
import { FactCard, FactRow, Pill } from "./door-ui";

export type Buyer = { name: string; email: string; phone: string };

type Issued = {
  orderId: string;
  amountCents: number;
  changeCents: number;
  currency: string;
  receiptCode: string | null;
  tickets: DoorIssuedTicket[];
  paidAt: string;
};

export type DoorCheckoutProps = {
  door: OpenDoor;
  sale: DoorSaleView;
  buyer: Buyer;
  setBuyer: (b: Buyer) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  methods: PosCollectionMethodState[];
  receiptOrigin: string;
  zone: string;
  locale: string;
  copy: DoorScreenCopy;
  onBack: () => void;
  onDone: () => Promise<void>;
};

/** One slot per ticket, in line order: "General admission #1", "General admission #2", "Workshop #1". */
function ticketSlots(sale: DoorSaleView): Array<{ key: string; tier: string; n: number }> {
  const slots: Array<{ key: string; tier: string; n: number }> = [];
  for (const line of sale.lines) for (let n = 1; n <= line.units; n += 1) slots.push({ key: `${line.id}-${n}`, tier: line.label, n });
  return slots;
}

export function DoorCheckout(props: DoorCheckoutProps) {
  const { copy, sale, door, zone, locale, buyer } = props;
  const att = copy.door.attendees;
  const slots = ticketSlots(sale);
  const [names, setNames] = useState<string[]>(() => slots.map((_, i) => (i === 0 ? buyer.name : "")));
  const [collectOpen, setCollectOpen] = useState(false);
  const [method, setMethod] = useState<PosCollectionMethodId>("cash");
  const [tenderedCents, setTenderedCents] = useState(sale.totalCents);
  const [tenderTouched, setTenderTouched] = useState(false);
  const [refusal, setRefusal] = useState<PosRefusalReason | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [resumeNote, setResumeNote] = useState<string | null>(null);

  const run = useCallback(
    async <T extends { ok: boolean; reason?: unknown; error?: unknown }>(fn: () => Promise<T>): Promise<T> => {
      props.setBusy(true);
      setRefusal(null);
      try {
        const result = await fn();
        setRefusal(refusalFromResult(result, "sale"));
        return result;
      } finally {
        props.setBusy(false);
      }
    },
    [props],
  );

  const collect = useCallback(async () => {
    const amountCents = sale.totalCents;
    const result = await run(() =>
      posDoorCollectTicket({
        orderId: sale.orderId,
        sessionId: door.session.id,
        expectedVersion: sale.version,
        amountCents,
        tenderedCents: Math.max(tenderedCents, amountCents),
        idempotencyKey: posCollectionKey({ orderId: sale.orderId, version: sale.version, method: "cash", amountCents }),
        holderName: buyer.name.trim() || undefined,
        email: buyer.email.trim() || undefined,
        phone: buyer.phone.trim() || undefined,
        attendeeNames: names.map((n) => n.trim()),
        admitNow: false,
      }),
    );
    if (!result.ok || !("tickets" in result)) return;
    setCollectOpen(false);
    setIssued({
      orderId: result.orderId,
      amountCents: result.amountCents,
      changeCents: result.changeCents,
      currency: sale.currency,
      receiptCode: result.receiptCode,
      tickets: result.tickets,
      paidAt: new Date().toISOString(),
    });
  }, [buyer, door.session.id, names, run, sale, tenderedCents]);

  const tryIssuingAgain = useCallback(async () => {
    if (!issued) return;
    props.setBusy(true);
    setResumeNote(null);
    try {
      const resumed = await resumeExceptionAction({
        verb: "mint_missing_admissions",
        sourceId: issued.orderId,
        idempotencyKey: `door-mint:${issued.orderId}:${issued.tickets.length}`,
      });
      const read = await posDoorIssuedTickets(issued.orderId);
      if (read.ok && "tickets" in read && read.tickets.length > 0) setIssued({ ...issued, tickets: read.tickets });
      else setResumeNote(resumed.ok ? resumed.message : resumed.error);
    } finally {
      props.setBusy(false);
    }
  }, [issued, props]);

  const receiptHref = issued?.receiptCode && props.receiptOrigin ? `${props.receiptOrigin}/r/${issued.receiptCode}` : null;
  const buyerLabel = buyer.name.trim() || copy.door.box.buyer;
  const summary = (
    <div className={cn(POS_SURFACE, "border-[1px]")}>
      {sale.lines.map((l) => (
        <div key={l.id} className="flex items-center gap-3 border-b border-admin-border-soft px-4 py-3 last:border-b-0">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-[15px] font-bold tabular-nums text-admin-ink">{l.units}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold text-admin-ink">{l.label}</span>
            <span className="block text-[14.5px] text-admin-ink-muted">{dateAt(door.session.startsAt, zone, locale)}</span>
          </span>
          <span className="text-[16.5px] font-bold tabular-nums text-admin-ink">{formatOrderMoney(l.totalCents, sale.currency)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-admin-border px-4 py-3">
        <span className="text-[17px] font-bold text-admin-ink">{copy.door.box.total}</span>
        <span className="text-[17px] font-bold tabular-nums text-admin-ink">{formatOrderMoney(sale.totalCents, sale.currency)}</span>
      </div>
    </div>
  );

  // ── E06 / E07 ─────────────────────────────────────────────────────────
  if (issued) {
    const pending = issued.tickets.length === 0;
    const iss = copy.door.issued;
    const ref = orderRef(issued.orderId);
    const paidTime = timeAt(issued.paidAt, zone, locale);
    return (
      <div data-door-issued={pending ? "pending" : "issued"} className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-6 text-center">
          <span className={cn("inline-flex h-24 w-24 items-center justify-center rounded-[32px]", pending ? "bg-admin-coral-soft text-admin-coral-deep" : "bg-admin-success-soft text-admin-success")}>
            {pending ? <AlertTriangle aria-hidden size={44} strokeWidth={1.8} /> : <Check aria-hidden size={48} strokeWidth={2.2} />}
          </span>
          <h2 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-admin-ink">
            {pending ? iss.pendingHeadline : issued.tickets.length === 1 ? iss.title : interpolate(iss.titleMany, { count: issued.tickets.length })}
          </h2>
          <p className="m-0 max-w-[520px] text-[16px] text-admin-ink-muted">
            {pending
              ? interpolate(iss.pendingDetail, { amount: formatOrderMoney(issued.amountCents, issued.currency) })
              : interpolate(iss.subtitle, { buyer: buyerLabel, amount: formatOrderMoney(issued.amountCents, issued.currency), time: paidTime })}
            {" · "}
            {ref}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Pill tone="green">{iss.paid}</Pill>
            <Pill tone={pending ? "coral" : "green"}>{pending ? iss.pendingPill : iss.ticketsIssued}</Pill>
            {!pending && (
              <span title={iss.sentByEmailReason} data-not-wired="true">
                <Pill tone="slate" className="opacity-60">
                  {iss.sentByEmail}
                </Pill>
              </span>
            )}
          </div>
          {issued.changeCents > 0 && (
            <p className="m-0 text-[15px] text-admin-ink">
              {copy.collect.change} {formatOrderMoney(issued.changeCents, issued.currency)}
            </p>
          )}
          {pending ? (
            <>
              <button type="button" disabled={props.busy} onClick={() => void tryIssuingAgain()} className={cn(POS_PRIMARY_ACTION, "h-[60px] w-full max-w-[520px]")} data-door-try-again>
                {iss.tryAgain}
              </button>
              <button type="button" disabled title={iss.paperConfirmationReason} data-not-wired="true" className={cn(POS_SECONDARY_ACTION, "w-full max-w-[520px]")}>
                {interpolate(iss.paperConfirmation, {})} · {ref}
              </button>
              <p className="m-0 max-w-[520px] text-[13px] text-admin-ink-muted">{iss.paperConfirmationReason}</p>
              {resumeNote && (
                <p role="status" className="m-0 max-w-[520px] text-[14px] text-admin-ink">
                  {resumeNote}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="grid w-full max-w-[520px] grid-cols-3 gap-2.5">
                {[
                  { label: iss.print, reason: iss.printReason },
                  { label: iss.text, reason: iss.textReason },
                  { label: iss.resend, reason: iss.resendReason },
                ].map((b) => (
                  <button key={b.label} type="button" disabled title={b.reason} data-not-wired="true" className={POS_SECONDARY_ACTION}>
                    {b.label}
                  </button>
                ))}
              </div>
              {receiptHref && (
                <a href={receiptHref} target="_blank" rel="noopener noreferrer" data-pos-receipt-link className="break-all text-[14px] text-admin-ink underline">
                  {iss.receipt}: {receiptHref}
                </a>
              )}
              <button type="button" onClick={() => void props.onDone()} className={cn(POS_PRIMARY_ACTION, "w-full max-w-[520px]")} data-door-next-customer>
                {iss.next}
              </button>
            </>
          )}
        </div>
        <div className="flex w-[526px] flex-col gap-2.5 overflow-y-auto border-l border-admin-border bg-admin-surface px-6 py-5">
          <div className={POS_EYEBROW}>{pending ? iss.ifFails : iss.eyebrow}</div>
          {pending ? (
            <FactCard>
              <FactRow label={iss.places}>{interpolate(iss.placesValue, { code: ref })}</FactRow>
              <FactRow label={iss.gate}>{interpolate(iss.gateValue, { code: ref })}</FactRow>
              <FactRow label={iss.issue}>{iss.issueValue}</FactRow>
              <FactRow label={iss.never}>{iss.neverValue}</FactRow>
            </FactCard>
          ) : (
            issued.tickets.map((t) => (
              <div key={t.admissionId} className={cn(POS_SURFACE, "flex flex-col gap-2 border-[1px] px-4 py-3.5")} data-door-ticket={t.admissionId}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-admin-surface-alt text-admin-ink">
                    <QrCode aria-hidden size={20} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-admin-ink">
                      {t.tierLabel ?? copy.door.lookup.ticket} · {t.holderName ?? copy.door.lookup.unnamed}
                    </span>
                    <span className="block text-[13.5px] text-admin-ink-muted">{t.holderName ? iss.named : iss.unnamed}</span>
                  </span>
                  <span className="font-mono text-[13px] text-admin-ink-muted">{ticketRef(issued.orderId, t.lineSeq, t.admissionId)}</span>
                </div>
                <div className="text-[12px] text-admin-ink-muted">{iss.code}</div>
                {t.code ? (
                  <code className="block break-all rounded-[8px] bg-admin-surface-alt px-2.5 py-1.5 text-[12px] text-admin-ink" data-door-code>
                    {t.code}
                  </code>
                ) : (
                  <p className="m-0 text-[12.5px] text-admin-red">{iss.codeUnavailable}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── The cash: the counter's own collect surface, full width ───────────
  if (collectOpen) {
    return (
      <div data-door-collect className="flex min-h-0 flex-1 flex-col">
        {refusal && (
          <div className="px-6 pt-4">
            <PosRefusalBanner reason={refusal} copy={copy.refusal} onRetry={() => setRefusal(null)} />
          </div>
        )}
        <CollectSheet
          amountDueCents={sale.totalCents}
          currency={sale.currency}
          methods={props.methods}
          activeMethod={method}
          onSelectMethod={setMethod}
          tenderedCents={tenderedCents}
          onKeypadPress={(key) => {
            setTenderedCents((current) => (key === "00" ? tenderAfterKey(tenderAfterKey(current, tenderTouched, "0"), true, "0") : tenderAfterKey(current, tenderTouched, key)));
            setTenderTouched(true);
          }}
          onTender={(cents) => {
            setTenderedCents(cents);
            setTenderTouched(true);
          }}
          onConfirmCash={() => void collect()}
          confirmLoading={props.busy}
          onBack={() => setCollectOpen(false)}
          backLabel={att.releaseBack}
          summary={sale.lines.map((l) => ({ label: `${l.units} × ${l.label}`, amountCents: l.totalCents }))}
          copy={copy.collect}
        />
      </div>
    );
  }

  // ── E04: who is coming ────────────────────────────────────────────────
  return (
    <div data-door-attendees className="relative flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-[18px]">
        {refusal && <PosRefusalBanner reason={refusal} copy={copy.refusal} onRetry={() => setRefusal(null)} />}
        <div className={POS_EYEBROW}>{att.buyerEyebrow}</div>
        <div className={cn(POS_SURFACE, "flex flex-col gap-3 border-[1px] p-4")}>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-admin-brand-soft text-[14px] font-semibold text-admin-brand">
              {initialsOf(buyer.name || "?")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold text-admin-ink">{buyer.name.trim() || copy.door.box.buyer}</span>
              <span className="block truncate text-[13.5px] text-admin-ink-muted">
                {[buyer.email.trim(), buyer.phone.trim()].filter(Boolean).join(" · ") || att.buyerHint}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex min-w-0 flex-col">
              <span className={POS_LABEL}>{att.buyerName}</span>
              <input value={buyer.name} onChange={(e) => props.setBuyer({ ...buyer, name: e.target.value })} disabled={props.busy} autoComplete="off" className={POS_INPUT} data-door-holder-name />
            </label>
            <label className="flex min-w-0 flex-col">
              <span className={POS_LABEL}>{att.buyerEmail}</span>
              <input type="email" value={buyer.email} onChange={(e) => props.setBuyer({ ...buyer, email: e.target.value })} disabled={props.busy} autoComplete="off" className={POS_INPUT} data-door-email />
            </label>
            <label className="flex min-w-0 flex-col">
              <span className={POS_LABEL}>{att.buyerPhone}</span>
              <input type="tel" value={buyer.phone} onChange={(e) => props.setBuyer({ ...buyer, phone: e.target.value })} disabled={props.busy} autoComplete="off" className={POS_INPUT} />
            </label>
          </div>
          <p className="m-0 text-[12.5px] text-admin-ink-muted">{att.contactHint}</p>
        </div>
        <div className={POS_EYEBROW}>{att.eyebrow}</div>
        {slots.map((slot, i) => (
          <div key={slot.key} className={cn(POS_SURFACE, "grid grid-cols-[200px_1fr] items-center gap-4 border-[1px] px-4 py-3.5")}>
            <span className="text-[15px] font-semibold text-admin-ink">{interpolate(att.attendeeNumber, { tier: slot.tier, n: slot.n })}</span>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="sr-only">{interpolate(att.attendeeNumber, { tier: slot.tier, n: slot.n })}</span>
              <input
                value={names[i] ?? ""}
                onChange={(e) => setNames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                disabled={props.busy}
                autoComplete="off"
                placeholder={att.attendeePlaceholder}
                className={POS_INPUT}
                data-door-attendee={i}
              />
              <span className="text-[12.5px] text-admin-ink-muted">
                {i === 0 && names[0] && names[0] === buyer.name ? att.sameAsBuyer : att.attendeeHint}
              </span>
            </label>
          </div>
        ))}
      </div>
      <div className="flex w-[400px] flex-col gap-3 overflow-y-auto border-l border-admin-border bg-admin-surface px-5 py-5">
        {summary}
        <div className="flex-1" />
        <button type="button" disabled={props.busy} onClick={() => setCollectOpen(true)} className={cn(POS_PRIMARY_ACTION, "h-[60px] w-full")} data-door-review>
          {interpolate(att.review, { amount: formatOrderMoney(sale.totalCents, sale.currency) })}
        </button>
        <button type="button" onClick={props.onBack} className={cn(POS_SECONDARY_ACTION, "w-full")}>
          {att.releaseBack}
        </button>
      </div>
    </div>
  );
}
