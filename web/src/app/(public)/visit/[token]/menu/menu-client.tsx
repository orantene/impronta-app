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
import {
  guestOptionCopy,
  guestPriceLabel,
  lineUnitCents,
  needsOption,
  type GuestMenuOptionItem,
} from "@/lib/visits/guest-menu-options";
import { venueEngineRefusalSentence, type VenueEngineRefusalSentences } from "@/lib/venues/engine-refusals";

export type GuestMenuItem = GuestMenuOptionItem & {
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  soldOut?: boolean;
};
export type GuestOffer = { lineId: string; offeringId: string; label: string };

export function GuestMenuClient(props: {
  token: string;
  tableCode: string;
  holderName: string | null;
  currency: string;
  locale: string;
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
    soldOut: string;
    priceOnRequest: string;
    offerTitle: string;
    acceptOffer: string;
    back: string;
  };
  refusals: VenueEngineRefusalSentences;
}) {
  const router = useRouter();
  // One entry per (dish, option): two sizes of one dish are two lines.
  const [qty, setQty] = useState<Record<string, number>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const oc = guestOptionCopy(props.locale);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const added = useMemo(
    () =>
      Object.entries(qty)
        .filter(([, n]) => n > 0)
        .flatMap(([key, n]) => {
          const [itemId, optionId] = key.split("|");
          const item = props.items.find((i) => i.id === itemId);
          const unit = item ? lineUnitCents(item, optionId ? optionId : null) : null;
          return item && unit != null ? [{ key, unit, n }] : [];
        }),
    [props.items, qty],
  );
  const draftCents = added.reduce((sum, l) => sum + l.unit * l.n, 0);

  const addItem = (item: GuestMenuItem, optionId: string | null) =>
    void run(async () => {
      const res = await guestVisitAddLine({ token: props.token, offeringId: item.id, variantId: optionId, qty: 1 });
      if (res.ok) {
        const key = `${item.id}|${optionId ?? ""}`;
        setQty((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
        setPicking(null);
      }
      return res;
    });

  async function run(work: () => Promise<{ ok: true } | { ok: false; reason: string }>) {
    setBusy(true);
    setRefusal(null);
    try {
      const res = await work();
      if (!res.ok) {
        setRefusal(venueEngineRefusalSentence(props.refusals, res.reason));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setRefusal(props.refusals.unavailable);
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
            {props.items.map((item, index) => {
              const price = guestPriceLabel(item);
              const open = picking === item.id;
              return (
                <li key={item.id} className="flex flex-col gap-2">
                  {item.category && item.category !== props.items[index - 1]?.category ? (
                    <h2 className="m-0 mt-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-admin-ink-muted" data-testid="guest-menu-category">
                      {item.category}
                    </h2>
                  ) : null}
                  <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.imageAlt ?? ""} className="h-14 w-14 shrink-0 rounded-[10px] object-cover" loading="lazy" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[15px] font-semibold text-admin-ink">{item.title}</p>
                      {item.description ? <p className="m-0 line-clamp-2 text-[12.5px] text-admin-ink-muted">{item.description}</p> : null}
                      {price.kind !== "none" ? (
                        <p className="m-0 text-[13px] text-admin-ink-muted">
                          {price.kind === "from" ? `${oc.from} ` : ""}
                          {formatOrderMoney(price.cents, props.currency)}
                          {item.soldOut ? ` · ${props.copy.soldOut}` : ""}
                        </p>
                      ) : (
                        <p className="m-0 text-[13px] text-admin-ink-muted">
                          {props.copy.priceOnRequest}
                          {item.soldOut ? ` · ${props.copy.soldOut}` : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={props.copy.add}
                      aria-expanded={item.options.length > 0 ? open : undefined}
                      disabled={busy || item.soldOut === true || (price.kind === "none" && item.options.length === 0)}
                      data-testid={`guest-add-${item.id}`}
                      onClick={() => {
                        // An item with options asks first; a dish with no price of its own cannot skip it.
                        if (item.options.length > 0) setPicking(open ? null : item.id);
                        else addItem(item, null);
                      }}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-admin-brand text-[20px] font-semibold text-admin-brand disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  {open ? (
                    <div role="group" aria-label={oc.choose} data-testid={`guest-options-${item.id}`} className="mt-3 flex flex-col gap-2">
                      <p className="m-0 text-[13px] font-semibold text-admin-ink">{oc.choose}</p>
                      {!needsOption(item) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => addItem(item, null)}
                          className="flex h-11 items-center justify-between rounded-[12px] border-[1.5px] border-admin-border px-3 text-[14px] text-admin-ink disabled:opacity-40"
                        >
                          <span>{oc.standard}</span>
                          <span>{formatOrderMoney(lineUnitCents(item, null) ?? 0, props.currency)}</span>
                        </button>
                      ) : null}
                      {item.options.map((o) => {
                        const unit = lineUnitCents(item, o.id);
                        return (
                          <button
                            key={o.id}
                            type="button"
                            disabled={busy || unit == null}
                            data-testid={`guest-option-${o.id}`}
                            onClick={() => addItem(item, o.id)}
                            className="flex h-11 items-center justify-between rounded-[12px] border-[1.5px] border-admin-border px-3 text-[14px] text-admin-ink disabled:opacity-40"
                          >
                            <span>{o.label}</span>
                            {unit != null ? <span>{formatOrderMoney(unit, props.currency)}</span> : null}
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => setPicking(null)} className="h-9 text-[13px] text-admin-ink-muted">
                        {oc.cancel}
                      </button>
                    </div>
                  ) : null}
                  </div>
                </li>
              );
            })}
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
