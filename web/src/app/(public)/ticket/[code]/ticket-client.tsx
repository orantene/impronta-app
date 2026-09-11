"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { interpolate } from "@/i18n/interpolate";
import { ticketLookup, ticketResend, ticketTransfer } from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

export function TicketSelfClient(props: {
  code: string;
  holderName: string | null;
  startsAt: string | null;
  copy: {
    title: string;
    night: string;
    show: string;
    transfer: string;
    toName: string;
    toEmail: string;
    transferAction: string;
    resend: string;
    lookup: string;
    last4: string;
    lookupAction: string;
    found: string;
  };
  tRefusal: (key: string) => string;
}) {
  const router = useRouter();
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [last4, setLast4] = useState("");
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  function say(reason: string) {
    return isRefusal(reason) ? props.tRefusal(VENUE_ENGINE_REFUSALS[reason]) : props.tRefusal(VENUE_ENGINE_REFUSALS.unavailable);
  }

  return (
    <main className="min-h-screen bg-admin-surface px-4 pb-10 pt-5 text-admin-ink">
      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-3.5">
        <header>
          <h1 className="m-0 text-[22px] font-semibold text-admin-ink">{props.copy.title}</h1>
          <p className="m-0 text-[13px] text-admin-ink-muted">{props.holderName}</p>
          {props.startsAt ? (
            <p className="m-0 text-[13px] text-admin-ink-muted">
              {props.copy.night}: {props.startsAt}
            </p>
          ) : null}
        </header>
        <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4">
          <p className="m-0 text-[13px] text-admin-ink-muted">{props.copy.show}</p>
          <code className="mt-2 block break-all text-[13px] font-semibold text-admin-ink">{props.code}</code>
        </section>
        {refusal ? <p role="alert" className="m-0 text-[13px] text-admin-red">{refusal}</p> : null}
        {notice ? <p role="status" className="m-0 text-[13px] text-admin-ink">{notice}</p> : null}

        <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4">
          <h2 className="m-0 text-[15px] font-semibold">{props.copy.transfer}</h2>
          <label className="mt-2 flex flex-col gap-1 text-[12px] font-semibold">
            {props.copy.toName}
            <input value={toName} onChange={(e) => setToName(e.target.value)} className="h-11 rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px]" />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-[12px] font-semibold">
            {props.copy.toEmail}
            <input value={toEmail} onChange={(e) => setToEmail(e.target.value)} className="h-11 rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px]" />
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
            {props.copy.transferAction}
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
                setNotice(props.copy.resend);
              });
            }}
            className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand disabled:opacity-40"
          >
            {props.copy.resend}
          </button>
        </section>

        <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4">
          <h2 className="m-0 text-[15px] font-semibold">{props.copy.lookup}</h2>
          <label className="mt-2 flex flex-col gap-1 text-[12px] font-semibold">
            {props.copy.toEmail}
            <input value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} className="h-11 rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px]" />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-[12px] font-semibold">
            {props.copy.last4}
            <input value={last4} onChange={(e) => setLast4(e.target.value)} inputMode="numeric" className="h-11 rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px]" />
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
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand disabled:opacity-40"
          >
            {props.copy.lookupAction}
          </button>
          {found.length > 0 ? (
            <ul className="m-0 mt-2 list-none p-0">
              {found.map((code) => (
                <li key={code}>
                  <a href={`/ticket/${encodeURIComponent(code)}`} className="text-[13px] font-semibold text-admin-brand">
                    {interpolate(props.copy.found, { code })}
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
