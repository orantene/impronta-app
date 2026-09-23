"use client";

/**
 * MaisonMenu — the service selector. The flagship of this template.
 *
 * ONE dataset (`TalentOffering[]`, exactly what the public storefront loader
 * returns) presented as four categories of full-width rows. A row states the
 * service, what it includes, its price and ONE action:
 *
 *   • fixed price, no extras  → "Seleccionar"      (selects inline)
 *   • variants and/or add-ons → "Elegir opciones"  (opens the sheet)
 *   • on request              → "Consultar"        (inquiry rail)
 *
 * Selection is single-service, because a Tulala appointment books one offering.
 * Selecting replaces. The selected row washes blush from the left and gains a
 * checkmark — a state that reads as CHOSEN, never as the primary action.
 *
 * This island also owns the mobile selection bar, because the bar reflects the
 * selection and fixed positioning frees it from this subtree's box. Before a
 * choice it invites ("Elige tu servicio · Ver servicios"); after one it states
 * the real service and the real total. It never shows a headline minimum price.
 *
 * Booking stays on the shared rail: every action dispatches the production
 * `tulala:offering-*` events through `OfferingCta`'s contract, so this menu
 * works unchanged against the real instant-book and inquiry mounts.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { resolveOfferingCta } from "@/lib/talent/offerings-types";
import { formatMoney } from "@/lib/talent/offerings-money";
import type { OfferingRequestDetail } from "../_shared/OfferingCta";

export type MaisonMenuCategory = { id: string; label: string; note?: string | null };

export type MaisonSelection = {
  offeringId: string;
  title: string;
  detail: string | null;
  totalCents: number;
  currency: string;
};

export function durationLabel(minutes: number, locale: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** The production event payload, built from an offering. */
function detailFor(o: TalentOffering): OfferingRequestDetail {
  const cta = resolveOfferingCta(o);
  const instant = cta === "book_now" || cta === "buy_now";
  return {
    offeringId: o.id,
    talentProfileId: o.talentProfileId,
    title: o.title,
    kind: o.kind,
    priceType: o.priceType,
    amountCents: o.amountCents,
    currency: o.currency,
    durationMinutes: o.durationMinutes,
    allowPayInPerson: o.allowPayInPerson,
    requireAccountToBook: o.requireAccountToBook === true,
    reserveMode: o.reserveMode,
    depositPct: o.depositPct,
    cancellationHours: o.cancellationHours,
    imageUrl: o.imageUrls[0] ?? null,
    variants: o.variants ?? [],
    addOns: o.addOns ?? [],
    inventoryQty: o.inventoryQty,
    intent: instant ? "instant" : "request",
  };
}

function dispatchOffering(o: TalentOffering, step?: "when", inclusion?: string | null) {
  const detail = detailFor(o);
  const instant = detail.intent === "instant";
  const slotEligible = !instant && o.kind !== "product" && (o.durationMinutes ?? 0) > 0;
  const name = instant
    ? "tulala:offering-instant"
    : slotEligible
      ? "tulala:offering-slot"
      : "tulala:offering-request";
  window.dispatchEvent(
    new CustomEvent(name, { detail: { ...detail, startAt: step, inclusion: inclusion ?? null } }),
  );
}

function basePrice(o: TalentOffering): number | null {
  const prices = [
    ...(o.variants ?? []).map((v) => v.amountCents ?? o.amountCents),
    o.amountCents,
  ].filter((c): c is number => typeof c === "number" && c > 0);
  return prices.length ? Math.min(...prices) : null;
}

/** The offering as this surface can actually sell it. */
/**
 * Exported ONLY so it can be tested directly. This is the single function that
 * stops the page promising a confirmation the engine cannot deliver, and it is
 * three lines with an early return — exactly the shape that survives review
 * while being subtly wrong. See maison-menu.test.ts.
 */
export function asSellable(o: TalentOffering, surface: "inquire" | "request" | "instant"): TalentOffering {
  if (surface === "instant" || o.bookingMode !== "instant") return o;
  return { ...o, bookingMode: "request" };
}

export function MaisonMenu({
  offerings,
  categories,
  locale,
  surfaceBooking = "instant",
  labels,
}: {
  offerings: TalentOffering[];
  categories: MaisonMenuCategory[];
  locale: string;
  /**
   * What this SURFACE can actually do, from resolveTalentBooking — which is
   * capped by the talent's plan (appointments-plan-policy: free tops out at
   * "request") and by the host. An offering row may say booking_mode
   * "instant" while the surface cannot confirm one, and in that case the page
   * must not promise a confirmation it cannot deliver. Degrading here changes
   * the CTA, the dispatched intent AND the sheet's final button together.
   */
  surfaceBooking?: "inquire" | "request" | "instant";
  labels: {
    select: string;
    options: string;
    consult: string;
    selected: string;
    from: string;
    durationNote: string;
    barIdleTitle: string;
    barIdleHint: string;
    barSeeServices: string;
    barContinue: string;
    emptyTitle: string;
    emptyBody: string;
  };
}) {
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const [selection, setSelection] = useState<MaisonSelection | null>(null);
  const [pastHero, setPastHero] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const money = useCallback(
    (cents: number, currency: string) => formatMoney(cents, currency, locale),
    [locale],
  );

  // The sheet reports the resolved choice back so the bar can state the real
  // service and the real total instead of guessing from the row.
  useEffect(() => {
    const onSelected = (e: Event) => {
      const d = (e as CustomEvent).detail as MaisonSelection | null;
      setSelection(d ?? null);
    };
    const onSheet = (e: Event) => {
      const d = (e as CustomEvent).detail as { open?: boolean } | undefined;
      setSheetOpen(d?.open === true);
    };
    window.addEventListener("tulala:maison-selected", onSelected);
    window.addEventListener("tulala:maison-sheet", onSheet);
    return () => {
      window.removeEventListener("tulala:maison-selected", onSelected);
      window.removeEventListener("tulala:maison-sheet", onSheet);
    };
  }, []);

  useEffect(() => {
    const hero = document.getElementById("mn-hero");
    if (!hero || typeof IntersectionObserver === "undefined") {
      setPastHero(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first) setPastHero(!first.isIntersecting);
      },
      { rootMargin: "-100px 0px 0px 0px" },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<string, TalentOffering[]>();
    for (const o of offerings) {
      const key = o.category ?? "";
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [offerings]);

  const onRowAction = (raw: TalentOffering, hasOptions: boolean, inclusion?: string | null) => {
    const o = asSellable(raw, surfaceBooking);
    if (hasOptions || o.visibility === "on_request") {
      dispatchOffering(o, undefined, inclusion);
      return;
    }
    // A service with nothing to configure still has to LEAD somewhere. Marking
    // the row and stopping left desktop visitors stranded (the summary bar is
    // mobile-only), so picking a fixed service goes straight to the calendar.
    setSelection({
      offeringId: o.id,
      title: o.title,
      detail: null,
      totalCents: o.amountCents ?? 0,
      currency: o.currency,
    });
    dispatchOffering(o, "when", inclusion);
  };

  const continueFromBar = () => {
    if (!selection) return;
    const found = offerings.find((o) => o.id === selection.offeringId);
    if (!found) return;
    const note = categories.find((x) => x.id === found.category)?.note ?? null;
    dispatchOffering(asSellable(found, surfaceBooking), "when", note);
  };

  return (
    <div className="mn-menu">
      <div className="mn-tabs" role="tablist" aria-label="Categorías">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active}
            className="mn-tab"
            data-active={c.id === active}
            onClick={() => setActive(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {categories.map((c) => {
        const rows = byCategory.get(c.id) ?? [];
        if (c.id !== active) return null;
        return (
          <div key={c.id} role="tabpanel" aria-label={c.label}>
            {c.note ? <p className="mn-cat-note">{c.note}</p> : null}
            {rows.length === 0 ? (
              <div className="mn-empty" style={{ marginTop: 26 }}>
                <h3 className="mn-display">{labels.emptyTitle}</h3>
                <p>{labels.emptyBody}</p>
              </div>
            ) : (
              <ul className="mn-rows">
                {rows.map((o) => {
                  const hasOptions = (o.variants ?? []).length > 0 || (o.addOns ?? []).length > 0;
                  const onRequest = o.visibility === "on_request";
                  const isSelected = selection?.offeringId === o.id;
                  const min = basePrice(o);
                  const ladder = (o.variants ?? []).length > 1;
                  return (
                    <li key={o.id} className="mn-row" data-selected={isSelected} data-offering={o.id}>
                      <div className="mn-row-in">
                        {o.imageUrls[0] ? (
                          <span className="mn-row-thumb">
                            <Image src={o.imageUrls[0]} alt="" fill sizes="92px" className="object-cover" />
                          </span>
                        ) : null}
                        <div className="mn-row-text">
                          <h3 className="mn-row-title">
                            {o.title}
                            {isSelected ? (
                              <span className="mn-check" aria-hidden="true">
                                ✓
                              </span>
                            ) : null}
                          </h3>
                          {o.description ? <p className="mn-row-desc">{o.description}</p> : null}
                          {o.durationMinutes ? (
                            <p className="mn-row-meta">
                              {durationLabel(o.durationMinutes, locale)} · {labels.durationNote}
                            </p>
                          ) : null}
                        </div>
                        <div className="mn-row-buy">
                          <p className="mn-row-price">
                            {onRequest || min === null ? (
                              <span className="mn-row-quote">{labels.consult}</span>
                            ) : (
                              <>
                                {ladder ? <small>{labels.from}</small> : null}
                                {money(min, o.currency)}
                              </>
                            )}
                          </p>
                          <button
                            type="button"
                            className="mn-row-action"
                            onClick={() => onRowAction(o, hasOptions, c.note ?? null)}
                            aria-pressed={isSelected}
                          >
                            {isSelected
                              ? labels.selected
                              : onRequest
                                ? labels.consult
                                : hasOptions
                                  ? labels.options
                                  : labels.select}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <div
        className="mn-bar"
        data-has-selection={selection !== null}
        data-show={!sheetOpen && (pastHero || selection !== null)}
      >
        <div className="mn-bar-text">
          <strong>{selection ? selection.title : labels.barIdleTitle}</strong>
          <span>
            {selection
              ? `${selection.detail ? `${selection.detail} · ` : ""}${money(selection.totalCents, selection.currency)}`
              : labels.barIdleHint}
          </span>
        </div>
        {selection ? (
          <button type="button" className="mn-btn mn-btn-primary" onClick={continueFromBar}>
            {labels.barContinue}
          </button>
        ) : (
          <a className="mn-btn mn-btn-primary" href="#servicios">
            {labels.barSeeServices}
          </a>
        )}
      </div>
    </div>
  );
}
