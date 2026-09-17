"use client";

/**
 * `/ticket/<code>` — the guest's ticket, on the venue's own site, in the
 * venue's own colours.
 *
 * TOKENS ONLY. This page sits on a tenant storefront: `--token-color-*` and
 * `--site-heading-font` are the venue's palette and type, projected by the
 * public layout. An `admin-*` class here paints the dashboard's green on a
 * noir venue (the static test pins their absence).
 *
 * EVERY ACTION IS REAL. Save image is the hosted QR (`/api/tickets/<code>/qr`) the e-mail embeds;
 * Print is `window.print` over the print sheet below; Copy is the clipboard;
 * Share is the Web Share API and, without it, the WhatsApp link the anchor
 * already carries; Transfer and Resend are the existing server actions;
 * Event info is a link only when the event has a public address; Request a
 * refund renders only when the event has refunds open and, refused, says
 * why in a sentence. No wallet passes: nothing signs them.
 *
 * The E08 board's contracts survive the redesign: the facts card (Name ·
 * When · Where · Order) under the QR, `data-ticket-page`, `data-ticket-state`
 * carrying the admission's own status word, the transfer / resend / lookup
 * forms rendered below the fold with their labels and `data-testid`s
 * (`ticket-transfer`, `ticket-resend`, `ticket-lookup`) that WIRE-3.9 drives,
 * and `data-ticket-qr`. The board's disabled "Add to Wallet" is gone on
 * purpose: nothing signs a pass, so nothing offers one.
 */

import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { interpolate } from "@/i18n/interpolate";
import { ticketLookup, ticketRefundRequest, ticketResend, ticketTransfer } from "@/lib/server-actions/venue-engine";
import { venueEngineRefusalSentence, type VenueEngineRefusalSentences } from "@/lib/venues/engine-refusals";

export type TicketCopy = {
  brand: string | null;
  title: string;
  back: string;
  night: string;
  dateTba: string;
  doors: string;
  event: string;
  admits: string;
  seat: string;
  vip: string;
  show: string;
  /** Under the QR: "Show this at the door · brightness up". */
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
  position: string;
  unnamed: string;
  codeLabel: string;
  transferNote: string;
  resendDone: string;
  save: string;
  print: string;
  copyLink: string;
  copied: string;
  share: string;
  shareText: string;
  eventInfo: string;
  transfer: string;
  toName: string;
  toEmail: string;
  transferAction: string;
  resend: string;
  refund: string;
  refundTitle: string;
  refundPolicy: string;
  refundPolicyText: string | null;
  refundReceived: string;
  refundReceivedManual: string;
  refundReasons: Record<string, string>;
  lookup: string;
  lookupEmail: string;
  last4: string;
  lookupAction: string;
  found: string;
};

export type TicketModel = {
  code: string;
  qrSvg: string | null;
  qrPngHref: string;
  holderName: string | null;
  /** The admission's own status word, as the door reads it (`data-ticket-state`). */
  status: string;
  /** `valid`, `used` (admitted people on a valid ticket) or `notValid` (void / refunded). */
  state: "valid" | "used" | "notValid";
  eventTitle: string;
  coverUrl: string | null;
  badge: { weekday: string; day: string; month: string } | null;
  nightLabel: string | null;
  venueLine: string | null;
  venueName: string | null;
  doorsClock: string | null;
  showClock: string | null;
  tierLabel: string;
  partySize: number;
  seatLabel: string | null;
  vip: boolean;
  /** The order as the door refers to it ("#3F9A"), and how many tickets it minted. */
  orderCode: string | null;
  orderCount: number | null;
  position: { n: number; m: number } | null;
  eventHref: string | null;
  whatsappHref: string;
  refundOpen: boolean;
  /** When refunds are not open: the reason, already a sentence, or null to say nothing. */
  refundClosedReason: string | null;
};

const ink: CSSProperties = { color: "var(--token-color-ink)" };
const muted: CSSProperties = { color: "var(--token-color-muted)" };
const card: CSSProperties = {
  background: "var(--token-color-surface-raised)",
  border: "1px solid var(--token-color-line)",
  borderRadius: 20,
};
const primaryFill: CSSProperties = { background: "var(--token-color-primary)", color: "var(--token-color-primary-on, #fff)" };
const heading: CSSProperties = { fontFamily: "var(--site-heading-font)" };
const INPUT =
  "h-12 w-full rounded-[12px] border px-3 text-[15px] outline-none focus:ring-2 focus:ring-[var(--token-color-primary)] bg-[var(--token-color-surface-raised)] border-[var(--token-color-line)] text-[var(--token-color-ink)]";
const ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-[13px] font-semibold no-underline transition-opacity disabled:opacity-40 border-[var(--token-color-line)] bg-[var(--token-color-surface-raised)] text-[var(--token-color-ink)]";

const PRINT_CSS = `
@media print {
  body { background: #fff !important; }
  [data-print="hide"] { display: none !important; }
  [data-ticket-sheet] { box-shadow: none !important; border: 1px solid #ddd !important; }
  [data-ticket-cover] { min-height: 140px !important; }
}
`;

function Chip({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold" style={{ background: "var(--token-color-line)", ...ink, ...style }}>
      {children}
    </span>
  );
}

export function TicketSelfClient({ m, copy, refusals }: { m: TicketModel; copy: TicketCopy; refusals: VenueEngineRefusalSentences }) {
  const router = useRouter();
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [last4, setLast4] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refundDone, setRefundDone] = useState<string | null>(null);
  const transferName = useRef<HTMLInputElement>(null);

  const say = (reason: string) => venueEngineRefusalSentence(refusals, reason);
  const sayRefund = (reason: string) => copy.refundReasons[reason] ?? say(reason);
  const pageUrl = () => (typeof window === "undefined" ? "" : window.location.href);
  const dim = m.state !== "valid";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setRefusal(say("unavailable"));
    }
  };

  const share = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      e.preventDefault();
      try {
        await navigator.share({ title: `${copy.title} · ${m.eventTitle}`, text: copy.shareText, url: pageUrl() });
      } catch {
        // The sheet was dismissed; nothing to say.
      }
    }
    // Otherwise the anchor's own href (WhatsApp) opens.
  };

  const stateLabel = m.state === "valid" ? copy.valid : m.state === "used" ? copy.used : copy.notValid;
  const orderLine = m.orderCode
    ? interpolate(m.orderCount === 1 ? copy.orderTicketOne : copy.orderTickets, { code: m.orderCode, count: m.orderCount ?? "" })
    : null;
  const whenLine = m.nightLabel ? `${m.nightLabel}${m.doorsClock ? ` · ${interpolate(copy.doors, { time: m.doorsClock })}` : ""}` : copy.dateTba;

  const fact = (label: string, value: string | null, dimmed?: boolean) =>
    value ? (
      <div className="flex items-start justify-between gap-4 border-b py-[9px] text-[14px] leading-[1.3] last:border-b-0" style={{ borderColor: "var(--token-color-line)" }}>
        <span className="shrink-0" style={muted}>{label}</span>
        <span className="text-right font-semibold" style={dimmed ? muted : ink}>{value}</span>
      </div>
    ) : null;

  return (
    <main className="min-h-screen px-4 pb-12 pt-4 sm:pt-10" style={{ background: "var(--token-color-background, #fff)", ...ink }} data-ticket-page>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-4 sm:max-w-[520px]">
        <header className="flex items-center justify-between gap-3" data-print="hide">
          <a href={m.eventHref ?? "/"} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold no-underline" style={ink} data-testid="ticket-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {copy.back}
          </a>
          {copy.brand ? <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={muted}>{copy.brand}</span> : null}
        </header>

        <h1 className="m-0 text-[26px] font-semibold leading-tight tracking-[-0.01em]" style={{ ...ink, ...heading }}>
          {copy.title}
        </h1>

        {/* THE TICKET: cover, tier, QR. One sheet so print keeps it together. */}
        <section className="overflow-hidden shadow-[0_18px_50px_-24px_rgba(0,0,0,0.35)]" style={card} data-ticket-sheet="">
          <div
            className="relative flex min-h-[220px] flex-col justify-end p-5"
            style={
              m.coverUrl
                ? { backgroundImage: `url(${m.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : { background: "linear-gradient(135deg, var(--token-color-primary) 0%, var(--token-color-secondary, var(--token-color-primary)) 100%)" }
            }
            data-ticket-cover=""
          >
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            {m.badge ? (
              <div className="absolute left-5 top-5 flex flex-col items-center rounded-[14px] bg-white/95 px-3 py-2 text-center leading-none text-black shadow-md" aria-label={m.nightLabel ?? undefined}>
                <span className="text-[10px] font-bold tracking-[0.14em]">{m.badge.weekday}</span>
                <span className="mt-1 text-[24px] font-bold tracking-tight" style={heading}>{m.badge.day}</span>
                <span className="mt-0.5 text-[10px] font-bold tracking-[0.14em]">{m.badge.month}</span>
              </div>
            ) : null}
            <span className="absolute right-5 top-5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-black" data-ticket-state={m.status} data-ticket-read={m.state}>
              {stateLabel}
            </span>
            <div className="relative text-white">
              <h2 className="m-0 text-[24px] font-semibold leading-[1.1] tracking-[-0.01em]" style={heading}>{m.eventTitle}</h2>
              {m.venueLine ? <p className="m-0 mt-1 text-[13px] opacity-90">{m.venueLine}</p> : null}
              {!m.badge ? <p className="m-0 mt-1 text-[13px] opacity-90">{copy.night}: {m.nightLabel ?? copy.dateTba}</p> : null}
              {m.showClock ? (
                <p className="m-0 mt-2 flex flex-wrap gap-x-3 text-[12px] font-semibold uppercase tracking-[0.08em] opacity-95">
                  {m.doorsClock ? <span>{interpolate(copy.doors, { time: m.doorsClock })}</span> : null}
                  <span>{interpolate(copy.event, { time: m.showClock })}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3" style={{ borderColor: "var(--token-color-line)" }}>
            <span className="text-[15px] font-semibold" style={ink}>{m.tierLabel}</span>
            {m.vip ? <Chip style={primaryFill}>{copy.vip}</Chip> : null}
            <Chip>{interpolate(copy.admits, { n: m.partySize })}</Chip>
            {m.seatLabel ? <Chip>{interpolate(copy.seat, { label: m.seatLabel })}</Chip> : null}
          </div>

          <div className="flex flex-col items-center px-5 py-6">
            {m.qrSvg ? (
              <div
                className={`w-[240px] max-w-full rounded-[16px] bg-white p-3 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${dim ? "opacity-40 grayscale" : ""}`}
                role="img"
                aria-label={copy.show}
                data-ticket-qr=""
                dangerouslySetInnerHTML={{ __html: m.qrSvg }}
              />
            ) : null}
            <p className="m-0 mt-3 text-center text-[13px]" style={muted}>{copy.showDoor}</p>
            <p className="m-0 mt-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={muted}>{copy.codeLabel}</p>
            <code className="mt-1 block max-w-full break-all text-center font-mono text-[12px] leading-relaxed" style={ink}>{m.code}</code>
          </div>

          {/* THE FACTS (E08): Name · When · Where · Order, on the venue's tokens. */}
          <div className="border-t px-5 py-1" style={{ borderColor: "var(--token-color-line)" }} data-testid="ticket-facts">
            {fact(copy.name, m.holderName ?? copy.unnamed, !m.holderName)}
            {fact(copy.when, whenLine)}
            {fact(copy.where, m.venueLine ?? m.venueName)}
            {fact(copy.order, orderLine ? `${orderLine}${m.position ? ` · ${interpolate(copy.position, { n: m.position.n, m: m.position.m })}` : ""}` : null)}
          </div>
        </section>

        {refusal ? <p role="alert" className="m-0 text-[13px] font-semibold" style={{ color: "var(--token-color-accent, var(--token-color-primary))" }}>{refusal}</p> : null}
        {notice ? <p role="status" className="m-0 text-[13px]" style={ink}>{notice}</p> : null}

        {/* ACTIONS — every one does something. */}
        <section className="grid grid-cols-2 gap-2" data-print="hide" data-testid="ticket-actions">
          <a href={m.qrPngHref} download={`ticket${m.orderCode ? `-${m.orderCode.replace(/^#/, "")}` : ""}.png`} className={ACTION} data-testid="ticket-save">
            {copy.save}
          </a>
          <button type="button" onClick={() => window.print()} className={ACTION} data-testid="ticket-print">
            {copy.print}
          </button>
          <button type="button" onClick={() => void copyLink()} className={ACTION} data-testid="ticket-copy">
            {copied ? copy.copied : copy.copyLink}
          </button>
          <a href={m.whatsappHref} target="_blank" rel="noopener noreferrer" onClick={(e) => void share(e)} className={ACTION} data-testid="ticket-share">
            {copy.share}
          </a>
          <button
            type="button"
            className={ACTION}
            data-testid="ticket-transfer-jump"
            onClick={() => {
              transferName.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              transferName.current?.focus({ preventScroll: true });
            }}
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
              // D-160: a thrown/rejected action still clears busy and says
              // something instead of leaving a dead button.
              void ticketResend({ code: m.code })
                .then((res) => {
                  setBusy(false);
                  if (!res.ok) {
                    setRefusal(say(res.reason));
                    return;
                  }
                  setNotice(copy.resendDone);
                })
                .catch(() => {
                  setBusy(false);
                  setRefusal(say("unavailable"));
                });
            }}
            className={ACTION}
          >
            {copy.resend}
          </button>
          {m.eventHref ? (
            <a href={m.eventHref} className={ACTION} data-testid="ticket-event-info">
              {copy.eventInfo}
            </a>
          ) : null}
        </section>
        <p className="m-0 text-center text-[12px] leading-[1.35]" style={muted} data-print="hide">{copy.transferNote}</p>

        {/* TRANSFER — always open: the journey (WIRE-3.9) lands here and types. */}
        <section className="p-4" style={card} data-print="hide" data-testid="ticket-transfer-form">
            <h2 className="m-0 text-[15px] font-semibold" style={ink}>{copy.transfer}</h2>
            <label className="mt-3 flex flex-col gap-1 text-[12px] font-semibold" style={ink}>
              {copy.toName}
              <input ref={transferName} value={toName} onChange={(e) => setToName(e.target.value)} className={INPUT} autoComplete="name" />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-[12px] font-semibold" style={ink}>
              {copy.toEmail}
              <input value={toEmail} onChange={(e) => setToEmail(e.target.value)} className={INPUT} inputMode="email" autoComplete="email" />
            </label>
            <button
              type="button"
              disabled={busy || !toName.trim() || !toEmail.includes("@")}
              data-testid="ticket-transfer"
              onClick={() => {
                setBusy(true);
                setRefusal(null);
                // Never leave the page unchanged AND silent (D-160): a non-ok
                // result renders its sentence, and a thrown/rejected action
                // still clears busy and says something instead of a dead button.
                void ticketTransfer({ code: m.code, toName, toEmail })
                  .then((res) => {
                    if (!res.ok) {
                      setBusy(false);
                      setRefusal(say(res.reason));
                      return;
                    }
                    // Leave `busy` set through the navigation; the new code's
                    // page is a fresh mount that resets it.
                    router.replace(`/ticket/${encodeURIComponent(res.code)}`);
                  })
                  .catch(() => {
                    setBusy(false);
                    setRefusal(say("unavailable"));
                  });
              }}
              className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40"
              style={primaryFill}
            >
              {copy.transferAction}
            </button>
          </section>

        {/* REFUNDS — the button only when the venue opened them; a sentence otherwise. */}
        {m.refundOpen || m.refundClosedReason || refundDone ? (
          <section className="p-4" style={card} data-print="hide" data-testid="ticket-refund">
            <h2 className="m-0 text-[15px] font-semibold" style={ink}>{copy.refundTitle}</h2>
            {copy.refundPolicyText ? (
              <p className="m-0 mt-1 text-[13px] leading-relaxed" style={muted}>
                <span className="font-semibold" style={ink}>{copy.refundPolicy}:</span> {copy.refundPolicyText}
              </p>
            ) : null}
            {refundDone ? (
              <p role="status" className="m-0 mt-3 text-[13px] font-semibold" style={ink} data-testid="ticket-refund-received">
                {refundDone}
              </p>
            ) : m.refundOpen ? (
              <button
                type="button"
                disabled={busy}
                data-testid="ticket-refund-request"
                onClick={() => {
                  setBusy(true);
                  setRefusal(null);
                  void ticketRefundRequest({ code: m.code })
                    .then((res) => {
                      setBusy(false);
                      if (!res.ok) {
                        setRefusal(sayRefund(res.reason));
                        return;
                      }
                      setRefundDone(res.awaitingReview ? copy.refundReceivedManual : copy.refundReceived);
                    })
                    .catch(() => {
                      setBusy(false);
                      setRefusal(say("unavailable"));
                    });
                }}
                className={`${ACTION} mt-3 w-full`}
              >
                {copy.refund}
              </button>
            ) : (
              <p className="m-0 mt-2 text-[13px]" style={muted} data-testid="ticket-refund-closed">
                {m.refundClosedReason}
              </p>
            )}
          </section>
        ) : null}

        <section className="p-4" style={card} data-print="hide">
          <h2 className="m-0 text-[15px] font-semibold" style={ink}>{copy.lookup}</h2>
          <label className="mt-3 flex flex-col gap-1 text-[12px] font-semibold" style={ink}>
            {copy.lookupEmail}
            <input value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} className={INPUT} inputMode="email" />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-[12px] font-semibold" style={ink}>
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
              void ticketLookup({ email: lookupEmail, last4OfReceipt: last4 })
                .then((res) => {
                  setBusy(false);
                  if (!res.ok) {
                    setRefusal(say(res.reason));
                    return;
                  }
                  setFound(res.codes);
                })
                .catch(() => {
                  setBusy(false);
                  setRefusal(say("unavailable"));
                });
            }}
            className={`${ACTION} mt-3 h-12 w-full`}
          >
            {copy.lookupAction}
          </button>
          {found.length > 0 ? (
            <ul className="m-0 mt-3 list-none p-0">
              {found.map((code) => (
                <li key={code}>
                  <a href={`/ticket/${encodeURIComponent(code)}`} className="text-[13px] font-semibold underline" style={ink}>
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
