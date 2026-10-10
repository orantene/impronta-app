"use client";

import { useEffect } from "react";

import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

import { clearBookingDraft, saveBookingDraft } from "./booking-draft-store";
import { catalogWhoPlaceNote } from "./catalog-who-place-copy";
import { preloadGuestCaptchaScript } from "./GuestCaptchaField";
import { catalogDayKey, catalogSelectedDateLabel, catalogTimezoneLabel } from "./catalog-booking-logic";

const ROW = { display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" } as const;

/** TUL-59 / TUL-516 E2: confirm-step recap: service, date, time, total, place note. */
export function CatalogWhoSummary({
  es,
  service,
  day,
  time,
  tz,
  total,
  where,
}: {
  es: boolean;
  service: string;
  day: Date;
  time: string | null;
  tz: string | null;
  total: string;
  /** Offering delivery place; drives the home-visit vs studio note. */
  where?: readonly OfferingDeliveryWhere[] | null;
}) {
  const zone = tz ? catalogTimezoneLabel(tz, es) : "";
  const val = { textAlign: "right" } as const;
  const placeNote = catalogWhoPlaceNote(where, es ? "es" : "en");
  return (
    <div className="jb-recap" data-catalog-who-summary="">
      <div style={ROW}>
        <span>{es ? "Servicio" : "Service"}</span>
        <b style={val}>{service}</b>
      </div>
      <div style={ROW}>
        <span>{es ? "Fecha" : "Date"}</span>
        <b style={val}>{catalogSelectedDateLabel(day, es)}</b>
      </div>
      <div style={ROW}>
        <span>{es ? "Hora" : "Time"}</span>
        <b style={val}>{zone ? `${time ?? ""} · ${zone}` : time}</b>
      </div>
      <div style={ROW}>
        <span>Total</span>
        <b style={val}>{total}</b>
      </div>
      {placeNote ? (
        <p className="jb-fixture" data-catalog-address-note="">
          {placeNote}
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
