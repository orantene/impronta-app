"use client";

import { useEffect } from "react";

import { clearBookingDraft, saveBookingDraft } from "./booking-draft-store";
import { preloadGuestCaptchaScript } from "./GuestCaptchaField";
import { CatalogCalendarIcon, CatalogClockIcon } from "./catalog-field-icons";
import { cardFeeCopy } from "@/lib/orders/checkout-quote-display";
import { catalogDayKey, catalogSelectedDateLabel, catalogTimezoneLabel } from "./catalog-booking-logic";

const ROW = { display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" } as const;
const LABEL = { display: "inline-flex", alignItems: "center", gap: 6 } as const;

/** TUL-59: confirm-step recap above "Confirmar cita": service, date, time, total, address note. */
export function CatalogWhoSummary({
  es,
  service,
  day,
  time,
  tz,
  placeCity,
  total,
  /** GRK-065: client-place bookings collect the address below; hide the studio "we send location" note. */
  addressNote = "studio",
  cardFee = null,
}: {
  es: boolean;
  service: string;
  day: Date;
  time: string | null;
  tz: string | null;
  placeCity?: string | null;
  total: string;
  addressNote?: "studio" | "client" | "none";
  /** TUL-1268 item 5: the pass-through card fee and what is charged now, shown before Stripe. */
  cardFee?: { feeLabel: string; payNowLabel: string } | null;
}) {
  const feeCopy = cardFeeCopy(es);
  const zone = tz ? catalogTimezoneLabel(tz, es, placeCity) : "";
  const val = { textAlign: "right" } as const;
  return (
    <div className="jb-recap" data-catalog-who-summary="">
      <div style={ROW}>
        <span>{es ? "Servicio" : "Service"}</span>
        <b style={val}>{service}</b>
      </div>
      <div style={ROW}>
        <span style={LABEL}><CatalogCalendarIcon />{es ? "Fecha" : "Date"}</span>
        <b style={val}>{catalogSelectedDateLabel(day, es)}</b>
      </div>
      <div style={ROW}>
        <span style={LABEL}><CatalogClockIcon />{es ? "Hora" : "Time"}</span>
        <b style={val}>{time && zone ? `${time} · ${zone}` : (time ?? "")}</b>
      </div>
      <div style={ROW}>
        <span>Total</span>
        <b style={val}>{total}</b>
      </div>
      {cardFee ? (
        <>
          <div style={ROW} data-catalog-card-fee="">
            <span>{feeCopy.fee}</span>
            <b style={val}>+ {cardFee.feeLabel}</b>
          </div>
          <div style={ROW} data-catalog-pay-now="">
            <span>{feeCopy.payNow}</span>
            <b style={val}>{cardFee.payNowLabel}</b>
          </div>
        </>
      ) : null}
      {addressNote === "studio" ? (
        <p className="jb-fixture" data-catalog-address-note="studio">
          {es ? "Te enviamos la ubicación exacta al confirmar" : "We'll send the exact address when you confirm"}
        </p>
      ) : addressNote === "client" ? (
        <p className="jb-fixture" data-catalog-address-note="client">
          {es ? "Indica abajo la dirección donde será el servicio" : "Enter the address where the service will happen below"}
        </p>
      ) : null}
    </div>
  );
}

/** TUL-59: persist the in-progress booking (never the captcha token), end it on success, preload the captcha. */
export function useBookingDraftEffects(a: {
  detail: { offeringId: string } | null;
  step: "choose" | "when" | "who" | "done";
  variantId: string | null;
  addOnIds: string[];
  dayIndex: number;
  time: string | null;
  liveStarts: string | null;
  name: string;
  email: string;
  phone: string;
  mode: "demo" | "live";
  days: Date[];
  draftKey: string;
  captchaRequired: boolean;
  captchaProvider: "hcaptcha" | "turnstile" | "none" | undefined;
}) {
  const { detail, step, variantId, addOnIds, dayIndex, time, liveStarts, name, email, phone, mode, days, draftKey } = a;
  const offeringId = detail?.offeringId ?? null;
  useEffect(() => {
    if (offeringId === null || step === "done") return;
    saveBookingDraft(draftKey, {
      offeringId,
      step,
      variantId,
      addOnIds,
      dayIndex,
      dayKey: mode === "demo" ? catalogDayKey(days[dayIndex] ?? days[0]!) : null,
      time,
      liveStarts,
      name,
      email,
      phone,
    });
  }, [offeringId, step, variantId, addOnIds, dayIndex, time, liveStarts, name, email, phone, mode, days, draftKey]);
  useEffect(() => {
    if (step === "done") clearBookingDraft(draftKey);
  }, [step, draftKey]);
  const { captchaRequired, captchaProvider } = a;
  useEffect(() => {
    if (offeringId === null || !captchaRequired) return;
    if (captchaProvider === "hcaptcha" || captchaProvider === "turnstile") void preloadGuestCaptchaScript(captchaProvider);
  }, [offeringId, captchaRequired, captchaProvider]);
}
