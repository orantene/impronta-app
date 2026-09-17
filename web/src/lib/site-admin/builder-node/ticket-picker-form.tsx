"use client";

/**
 * ticket_picker: the form pieces shared by the legacy single screen (layout
 * "list") and the v3 checkout sheet. Pure presentation over props; every
 * rule (what is required, what the server refuses) lives in the island.
 */

import type { ReactNode } from "react";

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";

export type T = (key: string) => string;

export function Stepper({
  t, qty, min, max, busy, onChange, size,
}: {
  t: T; qty: number; min: number; max: number; busy: boolean; onChange: (next: number) => void; size?: "card";
}) {
  return (
    <div className="tp-stepper" data-size={size} role="group" aria-label={t("quantity")}>
      <button type="button" className="tp-step" aria-label={t("decrease")} disabled={busy || qty <= min} onClick={() => onChange(qty - 1)}>−</button>
      <span className="tp-qty" aria-live="polite">{qty}</span>
      <button type="button" className="tp-step" aria-label={t("increase")} disabled={busy || qty >= max} onClick={() => onChange(qty + 1)}>+</button>
    </div>
  );
}

export function SeatsSection({
  t, night, pickedSeats, busy, holdUntil, onToggle, onHold,
}: {
  t: T; night: PickerNight; pickedSeats: string[]; busy: boolean; holdUntil: string | null;
  onToggle: (seatId: string, on: boolean) => void; onHold: () => void;
}) {
  if ((night.seats?.length ?? 0) === 0) return null;
  return (
    <div className="tp-section" data-ticket-picker="seats">
      <div className="tp-label">{t("seats")}</div>
      <div className="tp-seats">
        {night.seats.map((seat) => {
          const on = pickedSeats.includes(seat.id);
          return (
            <button
              key={seat.id}
              type="button"
              className="tp-seat"
              data-on={on ? "1" : undefined}
              data-seat={seat.id}
              data-testid={`ticket-seat-${seat.id}`}
              aria-pressed={on}
              disabled={busy}
              onClick={() => onToggle(seat.id, on)}
            >
              {seat.label}
            </button>
          );
        })}
      </div>
      <button type="button" className="tp-cta" data-testid="ticket-hold-seats" disabled={busy || pickedSeats.length === 0} onClick={onHold}>
        {busy ? t("holdingSeats") : t("holdSeats")}
      </button>
      {holdUntil ? <p className="tp-help">{t("heldUntil").replace("{when}", holdUntil)}</p> : null}
    </div>
  );
}

export type DetailsState = {
  email: string; name: string; phone: string; promo: string;
  payHow: "full" | "in_person"; ageOk: boolean;
};

export function DetailsFields({
  t, state, onChange, busy, emailError, showPhone, doorOffered, ageGate, emailId,
}: {
  t: T;
  state: DetailsState;
  onChange: (patch: Partial<DetailsState>) => void;
  busy: boolean;
  /** Inline validation sentence under the e-mail field, or null. */
  emailError: string | null;
  showPhone: boolean;
  doorOffered: boolean;
  ageGate: number | null;
  emailId?: string;
}) {
  const errId = emailId ? `${emailId}-err` : undefined;
  return (
    <>
      <label>
        <span className="tp-field-label">{t("email")}</span>
        <input
          id={emailId}
          className="tp-field"
          type="email"
          value={state.email}
          onChange={(e) => onChange({ email: e.target.value })}
          disabled={busy}
          required
          autoComplete="email"
          inputMode="email"
          placeholder={t("emailPlaceholder")}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={emailError ? errId : undefined}
        />
        {emailError ? <span className="tp-field-error" id={errId} role="alert">{emailError}</span> : <span className="tp-help">{t("emailHelp")}</span>}
      </label>
      <label>
        <span className="tp-field-label">{t("name")}</span>
        <input className="tp-field" type="text" value={state.name} onChange={(e) => onChange({ name: e.target.value })} disabled={busy} autoComplete="name" placeholder={t("namePlaceholder")} />
      </label>
      {showPhone ? (
        <label>
          <span className="tp-field-label">{t("phone")}</span>
          <input className="tp-field" type="tel" value={state.phone} onChange={(e) => onChange({ phone: e.target.value })} disabled={busy} autoComplete="tel" inputMode="tel" placeholder={t("phonePlaceholder")} />
        </label>
      ) : null}
      <label>
        <span className="tp-field-label">{t("promo")}</span>
        <input
          className="tp-field"
          type="text"
          name="promo"
          autoComplete="off"
          spellCheck={false}
          value={state.promo}
          onChange={(e) => onChange({ promo: e.target.value })}
          disabled={busy}
          placeholder={t("promoPlaceholder")}
          aria-label={t("promo")}
        />
      </label>
      {doorOffered ? (
        <div role="radiogroup" aria-label={t("payHow")}>
          <div className="tp-label">{t("payHow")}</div>
          <div className="tp-choices">
            <label className="tp-choice" data-on={state.payHow === "full" ? "1" : undefined}>
              <input className="tp-radio" type="radio" name="payHow" checked={state.payHow === "full"} onChange={() => onChange({ payHow: "full" })} disabled={busy} />
              <span className="tp-choice-copy"><span className="tp-choice-title">{t("payCard")}</span></span>
            </label>
            <label className="tp-choice" data-on={state.payHow === "in_person" ? "1" : undefined}>
              <input className="tp-radio" type="radio" name="payHow" checked={state.payHow === "in_person"} onChange={() => onChange({ payHow: "in_person" })} disabled={busy} />
              <span className="tp-choice-copy">
                <span className="tp-choice-title">{t("payDoor")}</span>
                <span className="tp-choice-meta">{t("payDoorHelp")}</span>
              </span>
            </label>
          </div>
        </div>
      ) : null}
      {ageGate ? (
        <div data-ticket-picker="age-gate">
          <div className="tp-label">{t("ageGate")}</div>
          <label className="tp-choice" data-on={state.ageOk ? "1" : undefined}>
            <input className="tp-radio" type="checkbox" checked={state.ageOk} onChange={(e) => onChange({ ageOk: e.target.checked })} disabled={busy} />
            <span className="tp-choice-copy">
              <span className="tp-choice-title">{t("ageConfirm").replace("{n}", String(ageGate))}</span>
              <span className="tp-choice-meta">{t("ageHelp")}</span>
            </span>
          </label>
        </div>
      ) : null}
    </>
  );
}

/** The final buy control's label for the current state. */
export function buyLabel(args: {
  t: T; busy: "idle" | "holding" | "redirecting"; door: boolean; payHow: "full" | "in_person";
  tier: Pick<PickerTier, "amountCents"> | null; totalLabel: string | null; override?: string;
}): ReactNode {
  const { t, busy, door, payHow, tier, totalLabel, override } = args;
  if (busy === "holding") return door && payHow === "in_person" ? t("holdDoor") : t("buying");
  if (busy === "redirecting") return t("redirecting");
  if (override) return override;
  if (door && payHow === "in_person") return t("holdForDoor");
  if (tier && tier.amountCents === 0) return t("buyFree");
  return totalLabel ? t("pay").replace("{amount}", totalLabel) : t("buy");
}
