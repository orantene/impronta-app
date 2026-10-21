"use client";

/**
 * The client side of the mount (TUL-1411): hands the dated purchase server
 * action to the booking step. Kept apart from the step so the step stays
 * testable without a server action.
 */

import { startDatedPurchase } from "@/app/(public)/_dated/dated-purchase-actions";
import type { DatedPicker } from "@/app/(public)/_dated/dated-picker-actions";
import { DatedPlacesStep } from "@/components/public-booking/DatedPlacesStep";

export function DatedPlacesMount(props: {
  tenantId: string;
  offeringId: string;
  locale: string;
  picker: Extract<DatedPicker, { ok: true }>;
  /** Same-site path the card page returns to if the guest backs out. */
  returnPath: string;
}) {
  return (
    <DatedPlacesStep
      tenantId={props.tenantId}
      offeringId={props.offeringId}
      locale={props.locale}
      picker={props.picker}
      returnPath={props.returnPath}
      onBook={startDatedPurchase}
    />
  );
}
