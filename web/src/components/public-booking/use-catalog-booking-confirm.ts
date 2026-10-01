"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { catalogSelectedStartStillOpen } from "./catalog-booking-logic";
import {
  catalogConfirmNetworkError,
  catalogSlotLostMessage,
  runCatalogConfirmWrite,
  type CatalogBookFn,
} from "./catalog-booking-confirm";
import type { CatalogBookingMode } from "./catalog-booking-logic";
import { catalogTakenSlotMessage, type CatalogTakenSlotNotice } from "./catalog-taken-slot";
import type { OfferingReserveMode } from "@/lib/talent/offerings-types";

type Step = "choose" | "when" | "who" | "done";

export function useCatalogBookingConfirm(input: {
  locale: string;
  mode: CatalogBookingMode;
  tenantId: string | null;
  bookFn?: CatalogBookFn;
  intent: "request" | "instant";
  talentProfileId: string | null;
  offeringId: string;
  reserveMode: OfferingReserveMode;
  allowPayInPerson: boolean;
  variantId: string | null;
  addOnIds: string[];
  liveStarts: string | null;
  liveTz: string;
  liveDays: Array<{ starts: string[] }>;
  bookingDurationMinutes: number;
  day: Date;
  time: string | null;
  captchaRequired: boolean;
  captchaToken: string;
  nameValid: boolean;
  emailValid: boolean;
  phoneValid: boolean;
  name: string;
  email: string;
  phone: string;
  setTouched: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setTime: Dispatch<SetStateAction<string | null>>;
  setLiveStarts: Dispatch<SetStateAction<string | null>>;
  setStep: Dispatch<SetStateAction<Step>>;
  setWrote: Dispatch<SetStateAction<boolean>>;
  setSlotsRefreshKey: Dispatch<SetStateAction<number>>;
  /** DS-4: the notice shown on the time step after a taken-slot error. */
  setTakenNotice: Dispatch<SetStateAction<CatalogTakenSlotNotice | null>>;
}) {
  const [busy, setBusy] = useState(false);
  const confirmInFlightRef = useRef(false);

  const resetConfirmGuards = useCallback(() => {
    setBusy(false);
    confirmInFlightRef.current = false;
  }, []);

  const recoverTakenSlot = (message: string) => {
    // DS-4: the visitor lands on the time step, so the message lives THERE (with
    // alternatives), not in `error`, which only the details step renders.
    input.setTakenNotice({
      message: catalogTakenSlotMessage({ locale: input.locale, lostClock: input.time, serverMessage: message }),
      lostStarts: input.liveStarts,
    });
    input.setError(null);
    input.setTime(null);
    input.setLiveStarts(null);
    input.setStep("when");
    input.setSlotsRefreshKey((n) => n + 1);
  };

  const confirm = async () => {
    input.setTouched(true);
    if (!input.nameValid || !input.emailValid || !input.phoneValid) return;
    if (input.captchaRequired && !input.captchaToken.trim()) {
      input.setError(
        input.locale.toLowerCase().startsWith("es")
          ? "Completa la verificación."
          : "Complete the verification.",
      );
      return;
    }
    if (confirmInFlightRef.current || busy) return;
    if (
      input.mode === "live" &&
      input.liveStarts &&
      input.liveDays.length > 0 &&
      !catalogSelectedStartStillOpen(
        input.liveStarts,
        input.liveDays.flatMap((d) => d.starts),
      )
    ) {
      recoverTakenSlot(catalogSlotLostMessage(input.locale));
      return;
    }
    confirmInFlightRef.current = true;
    setBusy(true);
    input.setError(null);
    try {
      const written = await runCatalogConfirmWrite({
        mode: input.mode,
        intent: input.intent,
        locale: input.locale,
        tenantId: input.tenantId,
        talentProfileId: input.talentProfileId,
        offeringId: input.offeringId,
        reserveMode: input.reserveMode,
        allowPayInPerson: input.allowPayInPerson,
        contactName: input.name.trim(),
        contactEmail: input.email.trim(),
        contactPhone: input.phone.trim() || null,
        variantId: input.variantId,
        addOnIds: input.addOnIds,
        liveStarts: input.liveStarts,
        liveTz: input.liveTz,
        bookingDurationMinutes: input.bookingDurationMinutes,
        day: input.day,
        time: input.time,
        captchaToken: input.captchaRequired ? input.captchaToken || null : null,
        bookFn: input.bookFn,
      });
      if (written.phase === "preview") {
        await new Promise((r) => window.setTimeout(r, input.mode === "demo" ? 400 : 200));
        input.setWrote(false);
        input.setStep("done");
        return;
      }
      const { outcome } = written;
      if (outcome.kind === "slot_taken") {
        recoverTakenSlot(outcome.message);
        return;
      }
      if (outcome.kind === "error" || outcome.kind === "payment_missing") {
        input.setWrote(false);
        input.setError(outcome.message);
        return;
      }
      if (outcome.kind === "redirect") {
        input.setWrote(true);
        window.location.href = outcome.path;
        return;
      }
      input.setWrote(true);
      input.setStep("done");
    } catch {
      input.setError(catalogConfirmNetworkError(input.locale));
    } finally {
      setBusy(false);
      confirmInFlightRef.current = false;
    }
  };

  return { busy, confirm, resetConfirmGuards };
}
