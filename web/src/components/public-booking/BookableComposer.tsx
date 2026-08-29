"use client";

/**
 * Opens the existing InquiryDrawer in appointment intake (slot step).
 * Used by /book and the profile BookingCard.
 */

import { useState } from "react";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { SlotPicker, type SlotPickerValue } from "@/components/public-booking/SlotPicker";
import {
  applyReservationToIntent,
  type ReservationStamp,
} from "@/lib/scheduling/reservation-intent";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { BookableOffering } from "@/components/public-booking/pick-bookable-offering";

export type { BookableOffering };

function baseIntent(
  offering: BookableOffering,
): InquiryIntent {
  return {
    source: "offering_request",
    requester: {},
    talent: offering.talentProfileId
      ? { selected_ids: [offering.talentProfileId], selection_mode: "i_know_who" }
      : undefined,
    location: offering.locationLabel
      ? { city: offering.locationLabel, status: "confirmed" }
      : { status: "unconfirmed" },
  };
}

export function BookableComposer({
  tenantSlug,
  agencyName,
  offering,
  showInlinePicker = true,
}: {
  tenantSlug: string;
  agencyName: string;
  offering: BookableOffering;
  showInlinePicker?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<SlotPickerValue | null>(null);

  function stampFromSlot(value: SlotPickerValue): ReservationStamp {
    return {
      v: 1,
      offering_id: offering.offeringId,
      starts_at: value.startsAt,
      ends_at: value.endsAt,
      timezone: value.timezone,
      duration_minutes: offering.durationMinutes,
      mode: "request",
    };
  }

  const initialIntent: InquiryIntent = slot
    ? applyReservationToIntent(baseIntent(offering), stampFromSlot(slot))
    : baseIntent(offering);

  return (
    <div>
      {showInlinePicker ? (
        <SlotPicker
          offeringId={offering.offeringId}
          durationMinutes={offering.durationMinutes}
          timezone={offering.timezone}
          value={slot}
          onChange={(next) => {
            setSlot(next);
            if (next) setOpen(true);
          }}
        />
      ) : null}
      {open ? (
        <InquiryDrawer
          source="offering_request"
          tenantSlug={tenantSlug}
          agencyName={agencyName}
          client={null}
          enableDraftAutosave={false}
          bookableOffering={offering}
          initialIntent={initialIntent}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
