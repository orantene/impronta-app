"use client";

/**
 * The guest's ticket page, drawn as the E08 board at 390: a white header
 * (back to the event, "Your ticket", the event), the QR card with its two
 * pills, the facts card (Name · When · Where · Order), then Add to Wallet
 * (no pass is offered yet: disabled with its sentence) and Transfer, which
 * scrolls to the transfer card. The transfer, resend and lookup forms stay
 * rendered below the fold: WIRE-3.9 drives them by their labels and test ids
 * (`ticket-transfer`, `ticket-resend`, `ticket-lookup`).
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { ticketLookup, ticketResend, ticketTransfer } from "@/lib/server-actions/venue-engine";
import { venueEngineRefusalSentence, type VenueEngineRefusalSentences } from "@/lib/venues/engine-refusals";

export type TicketFacts = {
  eventTitle: string | null;
  eventSlug: string | null;
  /** "Fri 18 Sep" on the venue's clock. */
  nightLabel: string | null;
  /** "19:00" on the venue's clock: the doors, or the start when no offset is set. */
  doorsLabel: string | null;
  venueName: string | null;
  tierLabel: string | null;
  orderCode: string | null;
  orderCount: number | null;
};

const CARD = "rounded-[16px] border border-admin-border bg-admin-card";
const INPUT = "h-11 w-full rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px] text-admin-ink";
const LABEL = "mt-2 flex flex-col gap-1 text-[12px] font-semibold text-admin-ink";
const OUTLINE = "inline-flex h-12 w-full items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand disabled:opacity-40";

export function TicketSelfClient(props: {
  code: string;
  /** Pre-rendered QR of `code` (SVG markup from the server), or null on overflow. */
  qrSvg: string | null;
  holderName: string | null;
  status: string;
  facts: TicketFacts;
  copy: {
    title: string;
    night: string;
    show: string;
    showDoor: string;
    valid: string;
    used: string;
    notValid: string;
    name: string;
    when: string;
    where: string;
    order: string;
    orderTickets: string;
    orderTicketOne: string;
    wallet: string;
    walletReason: string;
    transferNote: string;
    unnamed: string;
    doors: string;
    codeLabel: string;
    transfer: string;
    toName: string;
    toEmail: string;
    transferAction: string;
    resend: string;
    resendDone: string;
    lookup: string;
    /** The reader's own e-mail (not the transfer's "New holder email"). */
    lookupEmail: string;
    last4: string;
    lookupAction: string;
    found: string;
  };
  refusals: VenueEngineRefusalSentences;
}) {
  const router = useRouter();
  const { copy, facts } = props;
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [last4, setLast4] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const transferName = useRef<HTMLInputElement>(null);

  function say(reason: string) {
    return venueEngineRefusalSentence(props.refusals, reason);
  }

  const state = props.status === "valid" ? { label: copy.valid, cls: "bg-admin-success-soft text-admin-success" } : props.status === "used" ? { label: copy.used, cls: "bg-admin-surface-alt text-admin-ink-muted" } : { label: copy.notValid, cls: "bg-admin-critical-soft text-admin-red" };
  const when = facts.nightLabel ? `${facts.nightLabel}${facts.doorsLabel ? ` · ${interpolate(copy.doors, { time: facts.doorsLabel })}` : ""}` : null;
  const order = facts.orderCode ? interpolate(facts.orderCount === 1 ? copy.orderTicketOne : copy.orderTickets, { code: facts.orderCode, count: facts.orderCount ?? "" }) : null;

  const fact = (label: string, value: string | null, muted?: boolean) =>
    value ? (
      <div className="flex items-start justify-between gap-4 border-b border-admin-border-soft py-[9px] text-[15px] leading-[1.25] last:border-b-0">
        <span className="shrink-0 text-admin-ink-muted">{label}</span>
        <span className={`text-right font-semibold ${muted ? "text-admin-ink-muted" : "text-admin-ink"}`}>{value}</span>
      </div>
    ) : null;

  return (
    <main className="min-h-screen bg-admin-surface pb-10 font-admin-body leading-[1.4] text-admin-ink" data-ticket-page>
      <header className="flex items-center gap-2 border-b border-admin-border bg-admin-card px-4 pb-3 pt-[52px]">
        {facts.eventSlug ? (
          <a href={`/events/${facts.eventSlug}`} aria-label={facts.eventTitle ?? copy.title} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-admin-ink hover:bg-admin-surface-alt">
            <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
          </a>
        ) : (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-admin-ink-dim">
            <ChevronLeft aria-hidden size={20} strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="m-0 font-admin-body text-[20px]! font-semibold leading-[1.2] tracking-[-0.01em] text-admin-ink">{copy.title}</h1>
          <p className="m-0 truncate text-[13px] leading-[1.3] text-admin-ink-muted">{facts.eventTitle ?? props.holderName ?? ""}</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-3 px-4 pt-4">
        <section className={`${CARD} flex flex-col items-center px-4 pb-4 pt-5`}>
          {props.qrSvg ? (
            <div
              className="w-[190px] max-w-full rounded-[12px] border border-admin-border bg-white p-3 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              role="img"
              aria-label={copy.show}
              data-ticket-qr=""
              dangerouslySetInnerHTML={{ __html: props.qrSvg }}
            />
          ) : null}
          <p className="m-0 mt-3 text-center text-[13px] text-admin-ink-muted">{copy.showDoor}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className={`inline-flex items-center rounded-full px-[11px] py-[4px] text-[13px] font-semibold ${state.cls}`} data-ticket-state={props.status}>
              {state.label}
            </span>
            {facts.tierLabel ? <span className="inline-flex items-center rounded-full bg-admin-indigo-soft px-[11px] py-[4px] text-[13px] font-semibold text-admin-indigo">{facts.tierLabel}</span> : null}
          </div>
          <details className="mt-3 w-full">
            <summary className="cursor-pointer list-none text-center text-[12px] text-admin-ink-dim">{copy.codeLabel}</summary>
            <code className="mt-2 block break-all rounded-[8px] bg-admin-surface-alt px-2.5 py-1.5 text-[12px] text-admin-ink">{props.code}</code>
          </details>
        </section>

        <section className={`${CARD} px-4 py-1`}>
          {fact(copy.name, props.holderName ?? copy.unnamed, !props.holderName)}
          {fact(copy.when, when)}
          {fact(copy.where, facts.venueName)}
          {fact(copy.order, order)}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled title={copy.walletReason} data-not-wired="true" className={OUTLINE}>
            {copy.wallet}
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-full items-center justify-center rounded-[12px] border-[1.5px] border-admin-border bg-admin-card text-[15px] font-semibold text-admin-ink"
            onClick={() => {
              transferName.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              transferName.current?.focus({ preventScroll: true });
            }}
          >
            {copy.transferAction}
          </button>
        </div>
        <p className="m-0 text-center text-[12px] leading-[1.35] text-admin-ink-muted">{copy.transferNote}</p>

        {refusal ? <p role="alert" className="m-0 text-[13px] text-admin-red">{refusal}</p> : null}
        {notice ? <p role="status" className="m-0 text-[13px] text-admin-ink">{notice}</p> : null}

        <section className={`${CARD} p-4`}>
          <h2 className="m-0 font-admin-body text-[15px]! font-semibold text-admin-ink">{copy.transfer}</h2>
          <label className={LABEL}>
            {copy.toName}
            <input ref={transferName} value={toName} onChange={(e) => setToName(e.target.value)} className={INPUT} />
          </label>
          <label className={LABEL}>
            {copy.toEmail}
            <input value={toEmail} onChange={(e) => setToEmail(e.target.value)} className={INPUT} />
          </label>
          <button
            type="button"
            disabled={busy || !toName.trim() || !toEmail.includes("@")}
            data-testid="ticket-transfer"
            onClick={() => {
              setBusy(true);
              setRefusal(null);
              void ticketTransfer({ code: props.code, toName, toEmail }).then((res) => {
                setBusy(false);
                if (!res.ok) {
                  setRefusal(say(res.reason));
                  return;
                }
                router.replace(`/ticket/${encodeURIComponent(res.code)}`);
              });
            }}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-admin-brand text-[15px] font-semibold text-admin-card disabled:opacity-40"
          >
            {copy.transferAction}
          </button>
          <button
            type="button"
            disabled={busy}
            data-testid="ticket-resend"
            onClick={() => {
              setBusy(true);
              setRefusal(null);
              setNotice(null);
              void ticketResend({ code: props.code }).then((res) => {
                setBusy(false);
                if (!res.ok) {
                  setRefusal(say(res.reason));
                  return;
                }
                setNotice(copy.resendDone);
              });
            }}
            className={`mt-2 ${OUTLINE}`}
          >
            {copy.resend}
          </button>
        </section>

        <section className={`${CARD} p-4`}>
          <h2 className="m-0 font-admin-body text-[15px]! font-semibold text-admin-ink">{copy.lookup}</h2>
          <label className={LABEL}>
            {copy.lookupEmail}
            <input value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} className={INPUT} />
          </label>
          <label className={LABEL}>
            {copy.last4}
            <input value={last4} onChange={(e) => setLast4(e.target.value)} inputMode="numeric" className={INPUT} />
          </label>
          <button
            type="button"
            disabled={busy}
            data-testid="ticket-lookup"
            onClick={() => {
              setBusy(true);
              setRefusal(null);
              setFound([]);
              void ticketLookup({ email: lookupEmail, last4OfReceipt: last4 }).then((res) => {
                setBusy(false);
                if (!res.ok) {
                  setRefusal(say(res.reason));
                  return;
                }
                setFound(res.codes);
              });
            }}
            className={`mt-3 ${OUTLINE}`}
          >
            {copy.lookupAction}
          </button>
          {found.length > 0 ? (
            <ul className="m-0 mt-2 list-none p-0">
              {found.map((code) => (
                <li key={code}>
                  <a href={`/ticket/${encodeURIComponent(code)}`} className="text-[13px] font-semibold text-admin-brand">
                    {interpolate(copy.found, { code })}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}
