"use client";

/**
 * Q05 bill, Q06 pay my share, Q07 already paid. Payment mints a Package 1
 * link through venue-engine.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { guestVisitPayShare } from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";

export type GuestBillLine = { id: string; label: string; units: number; totalCents: number };

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

export function GuestShareClient(props: {
  token: string;
  tableCode: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  owedCents: number;
  lines: GuestBillLine[];
  copy: {
    title: string;
    tableLine: string;
    myItems: string;
    splitEven: string;
    anAmount: string;
    payCard: string;
    alreadyPaid: string;
    leftover: string;
    back: string;
    empty: string;
    total: string;
    paid: string;
    owed: string;
  };
  tRefusal: (key: string) => string;
}) {
  const [tab, setTab] = useState<"items" | "even" | "amount">("items");
  const [picked, setPicked] = useState<string[]>([]);
  const [amountDraft, setAmountDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const pickedCents = useMemo(
    () => props.lines.filter((line) => picked.includes(line.id)).reduce((sum, line) => sum + line.totalCents, 0),
    [picked, props.lines],
  );
  const evenCents = props.owedCents > 0 ? props.owedCents : 0;
  const customCents = Math.round(Number(amountDraft) * 100);
  const payCents = tab === "items" ? pickedCents : tab === "even" ? evenCents : customCents;
  const alreadyPaid = props.owedCents <= 0 && props.totalCents > 0;

  async function pay() {
    setBusy(true);
    setRefusal(null);
    try {
      const res = await guestVisitPayShare({
        token: props.token,
        amountCents: tab === "items" ? undefined : payCents,
        lineIds: tab === "items" ? picked : undefined,
        operationKey: `share-${props.token}-${Date.now()}`,
      });
      if (!res.ok) {
        setRefusal(isRefusal(res.reason) ? props.tRefusal(VENUE_ENGINE_REFUSALS[res.reason]) : props.tRefusal(VENUE_ENGINE_REFUSALS.unavailable));
        return;
      }
      window.location.href = res.url;
    } catch {
      setRefusal(props.tRefusal(VENUE_ENGINE_REFUSALS.unavailable));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-admin-surface px-4 pb-28 pt-5 text-admin-ink">
      <div className="mx-auto flex w-full max-w-[390px] flex-col gap-3.5">
        <header>
          <Link href={`/visit/${props.token}`} className="text-[13px] text-admin-ink-muted">
            {props.copy.back}
          </Link>
          <h1 className="m-0 mt-1 text-[22px] font-semibold text-admin-ink">{props.copy.title}</h1>
          <p className="m-0 text-[13px] text-admin-ink-muted">
            {interpolate(props.copy.tableLine, { code: props.tableCode, amount: formatOrderMoney(props.totalCents, props.currency) })}
          </p>
        </header>
        {alreadyPaid ? (
          <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-brand-soft p-4 text-[14px] text-admin-ink">
            {props.copy.alreadyPaid}
          </section>
        ) : null}
        {refusal ? <p role="alert" className="m-0 text-[13px] text-admin-red">{refusal}</p> : null}
        <div className="flex gap-1 rounded-full bg-admin-surface-alt p-1">
          {(["items", "even", "amount"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`h-9 flex-1 rounded-full text-[13px] font-semibold ${
                tab === id ? "bg-admin-card text-admin-ink" : "text-admin-ink-muted"
              }`}
            >
              {id === "items" ? props.copy.myItems : id === "even" ? props.copy.splitEven : props.copy.anAmount}
            </button>
          ))}
        </div>
        {props.lines.length === 0 ? (
          <p className="m-0 text-[14px] text-admin-ink-muted">{props.copy.empty}</p>
        ) : (
          <ul className="m-0 list-none rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-0">
            {props.lines.map((line) => {
              const on = picked.includes(line.id);
              return (
                <li key={line.id} className="flex items-center gap-3 border-b border-admin-border-soft px-4 py-3 last:border-b-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    data-testid={`guest-line-${line.id}`}
                    onClick={() => setPicked((prev) => (on ? prev.filter((id) => id !== line.id) : [...prev, line.id]))}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-[6px] border ${
                      on ? "border-admin-brand bg-admin-brand text-admin-card" : "border-admin-border-strong bg-admin-card"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </button>
                  <span className="text-[13px] font-bold text-admin-ink">{line.units}</span>
                  <span className="min-w-0 flex-1 font-semibold text-admin-ink">{line.label}</span>
                  <span className="tabular-nums">{formatOrderMoney(line.totalCents, props.currency)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {tab === "amount" ? (
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-admin-ink">
            {props.copy.anAmount}
            <input
              inputMode="decimal"
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              className="h-11 rounded-[10px] border border-admin-border bg-admin-card px-3 text-[15px] text-admin-ink"
            />
          </label>
        ) : null}
        <dl className="m-0 text-[14px]">
          <div className="flex justify-between py-1">
            <dt className="text-admin-ink-muted">{props.copy.total}</dt>
            <dd className="m-0 font-semibold">{formatOrderMoney(props.totalCents, props.currency)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-admin-ink-muted">{props.copy.paid}</dt>
            <dd className="m-0 font-semibold">{formatOrderMoney(props.paidCents, props.currency)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-admin-ink-muted">{props.copy.owed}</dt>
            <dd className="m-0 font-semibold">{formatOrderMoney(props.owedCents, props.currency)}</dd>
          </div>
        </dl>
        <p className="m-0 text-[12px] text-admin-ink-muted">
          {interpolate(props.copy.leftover, { amount: formatOrderMoney(Math.max(0, props.owedCents - payCents), props.currency) })}
        </p>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-admin-border bg-admin-card px-4 py-3">
        <div className="mx-auto w-full max-w-[390px]">
          <button
            type="button"
            disabled={busy || alreadyPaid || payCents <= 0}
            data-testid="guest-pay-share"
            onClick={() => void pay()}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-admin-brand text-[15px] font-semibold text-admin-card disabled:opacity-40"
          >
            {interpolate(props.copy.payCard, { amount: formatOrderMoney(payCents, props.currency) })}
          </button>
        </div>
      </div>
    </main>
  );
}
