"use client";

import { useState } from "react";

import { composeLocationText, serviceAddressRule, validateServiceAddress } from "@/lib/scheduling/service-address";
import { serviceLocationLabel } from "@/lib/scheduling/booking-event-location";
import type { OfferingDeliveryWhere } from "@/lib/talent/offering-request-detail";

/**
 * TUL-436: the sheet's service-address state. Asks only when the offering is
 * delivered at the client's place; otherwise everything is inert and the
 * booking keeps sending the offering's delivery label (TUL-426).
 */
export function useServiceAddress(where: readonly OfferingDeliveryWhere[] | null | undefined, locale: string) {
  const rule = serviceAddressRule(where);
  const [fields, setFields] = useState({ address: "", note: "" });
  const [touched, setTouched] = useState(false);
  const checked = validateServiceAddress(fields, rule);
  return {
    rule,
    fields,
    setFields,
    showError: setTouched,
    error: touched && !checked.ok ? checked.error : null,
    valid: checked.ok,
    /** What the sheet sends as the booking's place: the typed address, else the delivery label. */
    eventLocation: (rule === "required" ? composeLocationText(fields) : null) ?? serviceLocationLabel(where, locale),
    payload: rule === "required" ? fields : null,
  };
}
