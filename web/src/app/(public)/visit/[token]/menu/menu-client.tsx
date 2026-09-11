"use client";

/**
 * Q02 browse + Q03 submit + Q04 accept a substitute. Guest writes go
 * through venue-engine only.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import {
  guestVisitAddLine,
  guestVisitSubmit,
  guestVisitSubstituteAccept,
} from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";

export type GuestMenuItem = { id: string; title: string; amountCents: number };
export type GuestOffer = { lineId: string; offeringId: string; label: string };

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

export function GuestMenuClient(props: {
  token: string;
  tableCode: string;
  holderName: string | null;
  currency: string;
  items: GuestMenuItem[];
  offers: GuestOffer[];
  copy: {
    title: string;
    tableLine: string;
    viewOrder: string;
    submit: string;
    submitted: string;
    orderMore: string;
    askBill: string;
    empty: string;
    add: string;
    offerTitle: string;
    acceptOffer: string;
    back: string;
  };
  tRefusal: (key: string) => string;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const added = useMemo(
    () => props.items.filter((item) => (qty[item.id] ?? 0) > 0),
    [props.items, qty],
  );
  const draftCents = added.reduce((sum, item) => sum + item.amountCents * (qty[item.id] ?? 0), 0);

  async function run(work: () => Promise<{ ok: true } | { ok: false; reason: string }>) {
    setBusy(true);
    setRefusal(null);
    try {
      const res = await work();
      if (!res.ok) {
        setRefusal(isRefusal(res.reason) ? props.tRefusal(VENUE_ENGINE_REFUSALS[res.reason]) : props.tRefusal(VENUE_ENGINE_REFUSALS.unavailable));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setRefusal(props.tRefusal(VENUE_ENGINE_REFUSALS.unavailable));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-admin-surface px-4 pb-10 pt-5 text-admin-ink">
        <div className="mx-auto flex w-full max-w-[390px] flex-col gap-3.5">
          <header>
            <h1 className="m-0 text-[22px] font-semibold text-admin-ink">{props.copy.title}</h1>
            <p className="m-0 text-[13px] text-admin-ink-muted">{interpolate(props.copy.tableLine, { code: props.tableCode })}</p>
          </header>
          <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-brand-soft p-4 text-[14px] text-admin-ink">
            {props.copy.submitted}
          </section>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSubmitted(false)} className="inline-flex h-12 items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand">
              {props.copy.orderMore}
            </button>
            <Link href={`/visit/${props.token}/share`} className="inline-flex h-12 items-center justify-center rounded-[12px] bg-admin-brand text-[15px] font-semibold text-admin-card">
              {props.copy.askBill}
            </Link>
          </div>
        </div>
      </main>
    );
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
            {interpolate(props.copy.tableLine, { code: props.tableCode })}
            {props.holderName ? ` · ${props.holderName}` : ""}
          </p>
        </header>
        {refusal ? <p role="alert" className="m-0 text-[13px] text-admin-red">{refusal}</p> : null}
        {props.offers.length > 0 ? (
          <section className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card p-4">
            <h2 className="m-0 text-[15px] font-semibold text-admin-ink">{props.copy.offerTitle}</h2>
            {props.offers.map((offer) => (
              <button
                key={offer.lineId}
                type="button"
                disabled={busy}
                data-testid={`guest-accept-${offer.lineId}`}
                onClick={() =>
                  void run(() =>
                    guestVisitSubstituteAccept({
                      token: props.token,
                      lineId: offer.lineId,
                      substituteOfferingId: offer.offeringId,
                    }),
                  )
                }
                className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-[12px] border-[1.5px] border-admin-brand bg-admin-card text-[15px] font-semibold text-admin-brand disabled:opacity-40"
              >
                {interpolate(props.copy.acceptOffer, { name: offer.label })}
              </button>
            ))}
          </section>
        ) : null}
        {props.items.length === 0 ? (
          <p className="m-0 text-[14px] text-admin-ink-muted">{props.copy.empty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {props.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-semibold text-admin-ink">{item.title}</p>
                  <p className="m-0 text-[13px] text-admin-ink-muted">{formatOrderMoney(item.amountCents, props.currency)}</p>
                </div>
                <button
                  type="button"
                  aria-label={props.copy.add}
                  disabled={busy}
                  data-testid={`guest-add-${item.id}`}
                  onClick={() =>
                    void run(async () => {
                      const res = await guestVisitAddLine({ token: props.token, offeringId: item.id, qty: 1 });
                      if (res.ok) setQty((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
                      return res;
                    })
                  }
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-admin-brand text-[20px] font-semibold text-admin-brand disabled:opacity-40"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {added.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-admin-border bg-admin-card px-4 py-3">
          <div className="mx-auto flex w-full max-w-[390px]">
            <button
              type="button"
              disabled={busy}
              data-testid="guest-submit"
              onClick={() =>
                void run(async () => {
                  const res = await guestVisitSubmit({ token: props.token });
                  if (res.ok) {
                    setSubmitted(true);
                    setQty({});
                  }
                  return res;
                })
              }
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-admin-brand text-[15px] font-semibold text-admin-card disabled:opacity-40"
            >
              {interpolate(props.copy.viewOrder, { n: added.length, amount: formatOrderMoney(draftCents, props.currency) })}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
