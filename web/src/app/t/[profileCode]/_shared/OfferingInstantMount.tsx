"use client";

/**
 * OfferingInstantMount — consumes "tulala:offering-instant" (a storefront
 * card's "Book now"/"Buy" click) and drives the generalized instant-book
 * action for the CHOSEN offering.
 *
 * W3-1: a rendered confirm SHEET (was a native confirm) — shows the offering,
 * its price, the reserve line (full / deposit % / free reserve), and the
 * payment choice (card now vs pay at the appointment when the talent allows
 * it). D4/D5: when the offering carries OPTIONS (variants) the client picks
 * one (price follows), EXTRAS (add-ons) stack on top, and per-unit offerings
 * get a quantity stepper — the sheet total recomputes live and the selection
 * rides to the engine, which re-validates every price server-side. Money notes
 * are honest: the final total includes fees; deposits show the approximate
 * up-front slice. Guests are routed to sign-in.
 */

import { useEffect, useState } from "react";
import { createInstantBookingAction } from "@/lib/server-actions/instant-book-action";
import type { OfferingRequestDetail } from "./OfferingCta";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";
import { QUANTITY_UNITS } from "@/lib/talent/offerings-offer";
import { pickLocale } from "@/lib/i18n/pick-locale";

const INK = "#101211";
const MUTED = "rgba(16,18,17,0.62)";
const HAIR = "rgba(16,18,17,0.12)";
const MAX_QTY = 9;

export function OfferingInstantMount({
  tenantId,
  sourcePage,
  locale,
}: {
  tenantId: string | null;
  sourcePage: string;
  locale: string;
}) {
  const [sheet, setSheet] = useState<OfferingRequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // D4/D5 selection state — reset per sheet open.
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!tenantId) return;
    const onInstant = (e: Event) => {
      const d = (e as CustomEvent).detail as OfferingRequestDetail | undefined;
      if (d) {
        setError(null);
        setVariantId(d.variants?.[0]?.id ?? null);
        setAddOnIds([]);
        setQty(1);
        setSheet(d);
      }
    };
    window.addEventListener("tulala:offering-instant", onInstant);
    return () => window.removeEventListener("tulala:offering-instant", onInstant);
  }, [tenantId]);

  if (!tenantId || !sheet) {
    // Invisible marker so QA can confirm the mount rendered + hydrated.
    return <span data-offering-instant-mount={tenantId ? "armed" : "no-tenant"} style={{ display: "none" }} />;
  }

  const d = sheet;
  const variants = d.variants ?? [];
  const addOns = d.addOns ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? null;

  // D5 — quantity applies to per-unit price types and stocked products.
  const qtyEligible =
    (QUANTITY_UNITS as readonly string[]).includes(d.priceType) || d.kind === "product";
  const qtyMax =
    d.kind === "product" && d.inventoryQty != null ? Math.max(1, Math.min(MAX_QTY, d.inventoryQty)) : MAX_QTY;
  const effQty = qtyEligible ? Math.max(1, Math.min(qtyMax, qty)) : 1;

  // Live total: (variant price ?? base) × qty + selected extras.
  const baseCents = variant?.amountCents ?? d.amountCents;
  const addOnCents = addOns.filter((a) => addOnIds.includes(a.id)).reduce((s, a) => s + a.amountCents, 0);
  const totalCents = baseCents != null ? baseCents * effQty + addOnCents : null;

  const price = totalCents != null ? formatOfferingPrice(totalCents, d.currency, locale) : "";
  const depositAmount =
    d.reserveMode === "deposit" && d.depositPct && totalCents
      ? formatOfferingPrice(Math.round((totalCents * d.depositPct) / 100), d.currency, locale)
      : null;
  const reserveLine =
    d.reserveMode === "free"
      ? pickLocale(locale, {
          en: "Reserve now, pay later — nothing is charged today.",
          es: "Reserva ahora y paga después — hoy no se cobra nada.",
        })
      : depositAmount
        ? pickLocale(locale, {
            en: `A ${d.depositPct}% deposit (~${depositAmount}) reserves it; the balance is due later.`,
            es: `Un depósito del ${d.depositPct}% (~${depositAmount}) la reserva; el resto se paga después.`,
          })
        : pickLocale(locale, {
            en: "The final total (including fees) is shown at payment.",
            es: "El total final (con tarifas) se muestra al pagar.",
          });

  const book = async (payInPerson: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await createInstantBookingAction({
        talentProfileId: d.talentProfileId,
        tenantId,
        sourcePage,
        offeringId: d.offeringId,
        payInPerson,
        variantId: variant?.id ?? null,
        addOnIds,
        quantity: effQty,
      });
      if (!res.ok) {
        if (res.needsAuth) {
          window.location.href = `/login?next=${encodeURIComponent(sourcePage)}`;
          return;
        }
        setError(res.error);
        return;
      }
      window.location.href = res.redirectPath;
    } finally {
      setBusy(false);
    }
  };

  const btn = (primary: boolean) =>
    ({
      display: "block",
      width: "100%",
      padding: "12px 16px",
      borderRadius: 12,
      border: primary ? `1px solid ${INK}` : `1px solid ${HAIR}`,
      background: primary ? INK : "#fff",
      color: primary ? "#fff" : INK,
      fontSize: 14,
      fontWeight: 600,
      cursor: busy ? "wait" : "pointer",
      fontFamily: '"Inter", system-ui, sans-serif',
    }) as const;

  const chip = (active: boolean) =>
    ({
      padding: "7px 12px",
      borderRadius: 999,
      border: active ? `1px solid ${INK}` : `1px solid ${HAIR}`,
      background: active ? INK : "#fff",
      color: active ? "#fff" : INK,
      fontSize: 12.5,
      fontWeight: 600,
      cursor: busy ? "wait" : "pointer",
      fontFamily: '"Inter", system-ui, sans-serif',
    }) as const;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={d.title}
      data-offering-confirm-sheet
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <button
        type="button"
        aria-label={pickLocale(locale, { en: "Close", es: "Cerrar" })}
        onClick={() => !busy && setSheet(null)}
        style={{ position: "absolute", inset: 0, background: "rgba(12,14,13,0.44)", border: "none", cursor: "pointer" }}
      />
      <div
        style={{
          position: "relative",
          width: "min(430px, calc(100vw - 24px))",
          margin: "0 12px 18px",
          background: "#FDFCFA",
          borderRadius: 18,
          padding: "22px 20px 18px",
          boxShadow: "0 24px 60px -18px rgba(0,0,0,0.45)",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        {d.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", marginBottom: 10, border: `1px solid ${HAIR}` }} />
        ) : null}
        <div style={{ fontSize: 16.5, fontWeight: 700, color: INK, letterSpacing: -0.2 }}>{d.title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }} data-sheet-total>
            {price}
          </span>
          {d.durationMinutes ? (
            <span style={{ fontSize: 12, color: MUTED }}>
              · {d.durationMinutes >= 60 && d.durationMinutes % 60 === 0 ? `${d.durationMinutes / 60} h` : `${d.durationMinutes} min`}
            </span>
          ) : null}
        </div>

        {variants.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }} data-sheet-variants>
            {variants.map((v) => (
              <button key={v.id} type="button" disabled={busy} onClick={() => setVariantId(v.id)} style={chip(v.id === variantId)} aria-pressed={v.id === variantId}>
                {v.label}
                {v.amountCents != null ? ` · ${formatOfferingPrice(v.amountCents, d.currency, locale)}` : ""}
              </button>
            ))}
          </div>
        ) : null}

        {addOns.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }} data-sheet-addons>
            {addOns.map((a) => {
              const on = addOnIds.includes(a.id);
              return (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: INK, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={() => setAddOnIds((cur) => (on ? cur.filter((x) => x !== a.id) : [...cur, a.id]))}
                    style={{ accentColor: INK, width: 15, height: 15 }}
                  />
                  <span style={{ flex: 1 }}>{a.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: MUTED }}>
                    +{formatOfferingPrice(a.amountCents, d.currency, locale)}
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        {qtyEligible ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }} data-sheet-qty>
            <span style={{ fontSize: 12.5, color: MUTED }}>
              {pickLocale(locale, { en: "Quantity", es: "Cantidad" })}
            </span>
            <button type="button" disabled={busy || effQty <= 1} onClick={() => setQty(Math.max(1, effQty - 1))} style={{ ...chip(false), padding: "4px 12px" }} aria-label="Decrease quantity">
              −
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: INK, minWidth: 18, textAlign: "center", fontVariantNumeric: "tabular-nums" }} data-sheet-qty-value>
              {effQty}
            </span>
            <button type="button" disabled={busy || effQty >= qtyMax} onClick={() => setQty(Math.min(qtyMax, effQty + 1))} style={{ ...chip(false), padding: "4px 12px" }} aria-label="Increase quantity">
              +
            </button>
          </div>
        ) : null}

        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, margin: "10px 0 4px" }}>{reserveLine}</p>
        {d.cancellationHours != null ? (
          <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: "0 0 16px" }}>
            {pickLocale(locale, {
              en: d.cancellationHours === 0 ? "Flexible cancellation." : `Free cancellation until ${d.cancellationHours}h before.`,
              es: d.cancellationHours === 0 ? "Cancelación flexible." : `Cancelación gratis hasta ${d.cancellationHours}h antes.`,
            })}
          </p>
        ) : (
          <span style={{ display: "block", marginBottom: 12 }} />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" disabled={busy} onClick={() => void book(false)} style={btn(true)} data-sheet-action="card">
            {d.reserveMode === "free"
              ? pickLocale(locale, { en: "Reserve now — free", es: "Reservar ahora — gratis" })
              : depositAmount
                ? pickLocale(locale, { en: `Reserve with ${depositAmount} deposit`, es: `Reservar con depósito de ${depositAmount}` })
                : pickLocale(locale, { en: `Book now · pay by card`, es: `Reservar ya · pagar con tarjeta` })}
          </button>
          {d.allowPayInPerson && d.reserveMode !== "free" ? (
            <button type="button" disabled={busy} onClick={() => void book(true)} style={btn(false)} data-sheet-action="cash">
              {pickLocale(locale, { en: "Reserve — pay at the appointment", es: "Reservar — pagar en la cita" })}
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => setSheet(null)} style={{ ...btn(false), border: "none", color: MUTED }}>
            {pickLocale(locale, { en: "Cancel", es: "Cancelar" })}
          </button>
        </div>

        <div style={{ minHeight: 14, marginTop: 8 }}>
          {busy ? <span style={{ fontSize: 11.5, color: MUTED }}>{pickLocale(locale, { en: "Booking…", es: "Reservando…" })}</span> : null}
          {error ? <span style={{ fontSize: 11.5, color: "#B3261E" }}>{error}</span> : null}
        </div>
      </div>
    </div>
  );
}
