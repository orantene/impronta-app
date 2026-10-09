"use client";

/**
 * Catalog island purchase rail (PKG-2 Option A).
 *
 * Listens for `tulala:offering-instant` and opens only for product / untimed
 * package purchases. Timed appointments stay on CatalogBookingSheet.
 * Lives under public-booking so the vanity catalog island never imports
 * `app/t/[profileCode]`.
 *
 * Demo/builder mode mounts a non-writing preview so Buy never dispatches to
 * nowhere when CatalogBookingSheet skips purchase-eligible events.
 */

import { useEffect, useState } from "react";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";
import { QUANTITY_UNITS } from "@/lib/talent/offerings-offer";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { GuestInstantContact } from "@/components/public-booking/GuestInstantContact";
import { PolicyLinkSheet } from "@/components/public-booking/PolicyLinkSheet";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import {
  catalogCollectNowCents,
  catalogDetailIsPurchase,
  type CatalogBookingMode,
} from "@/components/public-booking/catalog-booking-logic";
import { offeringRequiresOnlineCollect } from "@/lib/talent/who-step-payment-copy";

const INK = "#101211";
const MUTED = "rgba(16,18,17,0.62)";
const HAIR = "rgba(16,18,17,0.12)";
const MAX_QTY = 9;

export function CatalogPurchaseMount({
  tenantId,
  locale,
  captcha = null,
  mode = "live",
  onlineCollectReady,
  signedIn = false,
  client = null,
}: {
  tenantId: string | null;
  locale: string;
  captcha?: GuestCaptchaConfig | null;
  mode?: CatalogBookingMode;
  /** PAY-2 B — platform Checkout ready; omit → assume ready (legacy). */
  onlineCollectReady?: boolean;
  /** TUL-62: skip empty guest fields; session supplies contact. */
  signedIn?: boolean;
  client?: { displayName?: string | null; email?: string | null } | null;
}) {
  const [sheet, setSheet] = useState<OfferingRequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAck, setPreviewAck] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [guestName, setGuestName] = useState(() => client?.displayName?.trim() ?? "");
  const [guestEmail, setGuestEmail] = useState(() => client?.email?.trim() ?? "");
  const [captchaToken, setCaptchaToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sourcePage, setSourcePage] = useState("/");

  const armed = mode === "demo" || Boolean(tenantId);

  useEffect(() => {
    setSourcePage(window.location.pathname || "/");
  }, []);

  useEffect(() => {
    if (!armed) return;
    const onInstant = (e: Event) => {
      const d = (e as CustomEvent).detail as OfferingRequestDetail | undefined;
      if (!d || !catalogDetailIsPurchase(d)) return;
      setError(null);
      setPreviewAck(false);
      setVariantId(d.variants?.[0]?.id ?? null);
      setAddOnIds([]);
      setQty(1);
      setSheet(d);
    };
    window.addEventListener("tulala:offering-instant", onInstant);
    return () => window.removeEventListener("tulala:offering-instant", onInstant);
  }, [armed]);

  if (!armed || !sheet) {
    return (
      <span
        data-catalog-purchase-mount={armed ? "armed" : "no-tenant"}
        data-catalog-purchase-mode={mode}
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
  const collectCents = catalogCollectNowCents(totalCents, d.reserveMode, d.depositPct);
  const price =
    totalCents != null ? formatOfferingPrice(totalCents, d.currency, locale) : "";
  const collectPrice =
    collectCents != null && collectCents > 0
      ? formatOfferingPrice(collectCents, d.currency, locale)
      : null;

  const paymentSetupBlocksBuy =
    onlineCollectReady === false &&
    offeringRequiresOnlineCollect({
      reserveMode: d.reserveMode,
      allowPayInPerson: d.allowPayInPerson,
    });

  const payCopy = (() => {
    if (paymentSetupBlocksBuy) {
      return pickLocale(locale, {
        en: "Online payment is not available right now. Send an inquiry to continue.",
        es: "El pago en línea no está disponible por ahora. Envía una consulta para continuar.",
      });
    }
    if (d.reserveMode === "free") {
      return pickLocale(locale, {
        en: "Nothing is charged now. Pay later as agreed. No appointment time is booked.",
        es: "No se cobra nada ahora. El pago se realiza después, según lo acordado. No se agenda una cita.",
      });
    }
    if (d.reserveMode === "deposit") {
      const pct =
        typeof d.depositPct === "number" &&
        Number.isFinite(d.depositPct) &&
        d.depositPct > 0 &&
        d.depositPct < 100
          ? Math.round(d.depositPct)
          : null;
      if (pct != null && collectPrice) {
        return pickLocale(locale, {
          en: `A ${pct}% deposit (${collectPrice}) is charged now. The rest is paid as agreed. No appointment time is booked.`,
          es: `Se cobra una seña del ${pct}% (${collectPrice}) ahora. El resto se paga según lo acordado. No se agenda una cita.`,
        });
      }
      return pickLocale(locale, {
        en: "A deposit is charged now. The rest is paid as agreed. No appointment time is booked.",
        es: "Se cobra una seña ahora. El resto se paga según lo acordado. No se agenda una cita.",
      });
    }
    return pickLocale(locale, {
      en: "Pay by card to complete this purchase. No appointment time is booked.",
      es: "Paga con tarjeta para completar la compra. No se agenda una cita.",
    });
  })();

  const primaryLabel = (() => {
    if (paymentSetupBlocksBuy) {
      return pickLocale(locale, {
        en: "Send inquiry",
        es: "Enviar consulta",
      });
    }
    if (d.reserveMode === "free") {
      return pickLocale(locale, {
        en: "Reserve · nothing due now",
        es: "Reservar · sin cargo ahora",
      });
    }
    if (d.reserveMode === "deposit" && collectPrice) {
      return pickLocale(locale, {
        en: `Pay deposit · ${collectPrice}`,
        es: `Pagar seña · ${collectPrice}`,
      });
    }
    return pickLocale(locale, {
      en: `Buy now · ${price}`,
      es: `Comprar · ${price}`,
    });
  })();

  const buy = async (payInPerson: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "demo") {
        setPreviewAck(true);
        return;
      }
      if (!tenantId || !d.talentProfileId) {
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
        // Signed-in: let the server use the session (same as BookableComposer).
        contactName: signedIn ? undefined : guestName,
        contactEmail: signedIn ? undefined : guestEmail,
        captchaToken: signedIn ? undefined : captchaToken || null,
        honeypot: signedIn ? undefined : honeypot,
        locale,
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
      data-catalog-purchase-mode={mode}
      data-catalog-reserve-mode={d.reserveMode}
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
          {payCopy}
        </p>

        {mode === "live" ? (
          <div style={{ margin: "8px 0 12px" }}>
            {signedIn ? (
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }} data-catalog-signed-in="">
                {pickLocale(locale, {
                  en: "You are signed in.",
                  es: "Tu sesión está iniciada.",
                })}
                {client?.email ? ` ${client.email}` : ""}
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>
        ) : null}

        {previewAck ? (
          <p
            role="status"
            data-catalog-purchase-preview-ack
            style={{ fontSize: 13, color: INK, marginBottom: 8 }}
          >
            {pickLocale(locale, {
              en: "Preview only. This purchase is not submitted.",
              es: "Solo vista previa. Esta compra no se envía.",
            })}
          </p>
        ) : null}

        {error ? (
          <p role="alert" style={{ fontSize: 13, color: "#b3261e", marginBottom: 8 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (paymentSetupBlocksBuy) {
                // Honesty path — no fake Buy / Confirm when Checkout cannot run.
                window.dispatchEvent(
                  new CustomEvent("tulala:offering-request", {
                    detail: { ...d, intent: "request" as const },
                  }),
                );
                setSheet(null);
                return;
              }
              void buy(false);
            }}
            style={btn(true)}
            data-catalog-purchase-action={paymentSetupBlocksBuy ? "inquiry" : "card"}
            data-catalog-collect-cents={
              paymentSetupBlocksBuy ? undefined : (collectCents ?? undefined)
            }
          >
            {primaryLabel}
          </button>
          {!paymentSetupBlocksBuy && d.allowPayInPerson ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void buy(true)}
              style={btn(false)}
              data-catalog-purchase-action="cash"
            >
              {pickLocale(locale, {
                en:
                  d.reserveMode === "free"
                    ? "Reserve · pay in person"
                    : "Buy · pay in person",
                es:
                  d.reserveMode === "free"
                    ? "Reservar · pagar en persona"
                    : "Comprar · pagar en persona",
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
        <div style={{ textAlign: "center", marginTop: 10, color: MUTED }}>
          <PolicyLinkSheet talentProfileId={d.talentProfileId} locale={locale} />
        </div>
      </div>
    </div>
  );
}
