"use client";

/**
 * Catalog island purchase rail (PKG-2 Option A).
 *
 * Listens for `tulala:offering-instant` and opens only for product / untimed
 * package purchases. Timed appointments stay on CatalogBookingSheet.
 * Lives under public-booking so the vanity catalog island never imports
 * `app/t/[profileCode]`.
 */

import { useEffect, useState } from "react";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";
import { QUANTITY_UNITS } from "@/lib/talent/offerings-offer";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { GuestInstantContact } from "@/components/public-booking/GuestInstantContact";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import { catalogDetailIsPurchase } from "@/components/public-booking/catalog-booking-logic";

const INK = "#101211";
const MUTED = "rgba(16,18,17,0.62)";
const HAIR = "rgba(16,18,17,0.12)";
const MAX_QTY = 9;

export function CatalogPurchaseMount({
  tenantId,
  locale,
  captcha = null,
}: {
  tenantId: string | null;
  locale: string;
  captcha?: GuestCaptchaConfig | null;
}) {
  const [sheet, setSheet] = useState<OfferingRequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sourcePage, setSourcePage] = useState("/");

  useEffect(() => {
    setSourcePage(window.location.pathname || "/");
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    const onInstant = (e: Event) => {
      const d = (e as CustomEvent).detail as OfferingRequestDetail | undefined;
      if (!d || !catalogDetailIsPurchase(d)) return;
      setError(null);
      setVariantId(d.variants?.[0]?.id ?? null);
      setAddOnIds([]);
      setQty(1);
      setSheet(d);
    };
    window.addEventListener("tulala:offering-instant", onInstant);
    return () => window.removeEventListener("tulala:offering-instant", onInstant);
  }, [tenantId]);

  if (!tenantId || !sheet) {
    return (
      <span
        data-catalog-purchase-mount={tenantId ? "armed" : "no-tenant"}
        style={{ display: "none" }}
      />
    );
  }

  const d = sheet;
  const variants = d.variants ?? [];
  const addOns = d.addOns ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const qtyEligible =
    (QUANTITY_UNITS as readonly string[]).includes(d.priceType) ||
    d.kind === "product" ||
    d.capacityPoolId != null;
  const qtyMax =
    d.capacityPoolId != null && d.inventoryQty != null
      ? Math.max(1, Math.min(MAX_QTY, d.inventoryQty))
      : MAX_QTY;
  const effQty = qtyEligible ? Math.max(1, Math.min(qtyMax, qty)) : 1;
  const baseCents = variant?.amountCents ?? d.amountCents;
  const addOnCents = addOns
    .filter((a) => addOnIds.includes(a.id))
    .reduce((s, a) => s + a.amountCents, 0);
  const totalCents = baseCents != null ? baseCents * effQty + addOnCents : null;
  const price =
    totalCents != null ? formatOfferingPrice(totalCents, d.currency, locale) : "";

  const buy = async (payInPerson: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (!d.talentProfileId) {
        setError(
          pickLocale(locale, {
            en: "This item cannot be purchased here yet.",
            es: "Este artículo aún no se puede comprar aquí.",
          }),
        );
        return;
      }
      const { createInstantBookingAction } = await import(
        "@/lib/server-actions/instant-book-action"
      );
      const res = await createInstantBookingAction({
        talentProfileId: d.talentProfileId,
        tenantId,
        sourcePage,
        offeringId: d.offeringId,
        payInPerson,
        variantId: variant?.id ?? null,
        addOnIds,
        quantity: effQty,
        contactName: guestName,
        contactEmail: guestEmail,
        captchaToken: captchaToken || null,
        honeypot,
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
      data-catalog-purchase-sheet
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        aria-label={pickLocale(locale, { en: "Close", es: "Cerrar" })}
        onClick={() => !busy && setSheet(null)}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(12,14,13,0.44)",
          border: "none",
          cursor: "pointer",
        }}
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
        <div style={{ fontSize: 16.5, fontWeight: 700, color: INK }}>{d.title}</div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: INK,
            marginTop: 4,
            fontVariantNumeric: "tabular-nums",
          }}
          data-sheet-total
        >
          {price}
        </div>

        {variants.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={busy}
                onClick={() => setVariantId(v.id)}
                style={chip(v.id === variantId)}
                aria-pressed={v.id === variantId}
              >
                {v.label}
                {v.amountCents != null
                  ? ` · ${formatOfferingPrice(v.amountCents, d.currency, locale)}`
                  : ""}
              </button>
            ))}
          </div>
        ) : null}

        {addOns.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {addOns.map((a) => {
              const on = addOnIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12.5,
                    color: INK,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={() =>
                      setAddOnIds((cur) =>
                        on ? cur.filter((x) => x !== a.id) : [...cur, a.id],
                      )
                    }
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span style={{ fontSize: 12.5, color: MUTED }}>
              {pickLocale(locale, { en: "Quantity", es: "Cantidad" })}
            </span>
            <button
              type="button"
              disabled={busy || effQty <= 1}
              onClick={() => setQty(Math.max(1, effQty - 1))}
              style={{ ...chip(false), padding: "4px 12px" }}
            >
              −
            </button>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: INK,
                minWidth: 18,
                textAlign: "center",
              }}
            >
              {effQty}
            </span>
            <button
              type="button"
              disabled={busy || effQty >= qtyMax}
              onClick={() => setQty(Math.min(qtyMax, effQty + 1))}
              style={{ ...chip(false), padding: "4px 12px" }}
            >
              +
            </button>
          </div>
        ) : null}

        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, margin: "12px 0" }}>
          {pickLocale(locale, {
            en: "Pay by card to complete this purchase. No appointment time is booked.",
            es: "Paga con tarjeta para completar la compra. No se agenda una cita.",
          })}
        </p>

        <div style={{ margin: "8px 0 12px" }}>
          <GuestInstantContact
            name={guestName}
            email={guestEmail}
            captcha={captcha}
            locale={locale}
            onName={setGuestName}
            onEmail={setGuestEmail}
            onCaptchaToken={setCaptchaToken}
          />
          <input
            type="text"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            style={{
              position: "absolute",
              left: -9999,
              height: 1,
              width: 1,
              overflow: "hidden",
            }}
          />
        </div>

        {error ? (
          <p role="alert" style={{ fontSize: 13, color: "#b3261e", marginBottom: 8 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void buy(false)}
            style={btn(true)}
            data-catalog-purchase-action="card"
          >
            {pickLocale(locale, {
              en: `Buy now · ${price}`,
              es: `Comprar · ${price}`,
            })}
          </button>
          {d.allowPayInPerson ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void buy(true)}
              style={btn(false)}
              data-catalog-purchase-action="cash"
            >
              {pickLocale(locale, {
                en: "Buy — pay in person",
                es: "Comprar — pagar en persona",
              })}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => setSheet(null)}
            style={{ ...btn(false), border: "none", color: MUTED }}
          >
            {pickLocale(locale, { en: "Cancel", es: "Cancelar" })}
          </button>
        </div>
      </div>
    </div>
  );
}
