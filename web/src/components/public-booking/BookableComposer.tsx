"use client";

/**
 * Opens the existing InquiryDrawer in appointment intake (slot step).
 * Used by /book and the profile BookingCard.
 */

import { useEffect, useState } from "react";
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
  const [eventOffering, setEventOffering] = useState<BookableOffering | null>(null);
  const active = eventOffering ?? offering;

  useEffect(() => {
    const onSlot = (e: Event) => {
      const d = (e as CustomEvent<{
        offeringId?: string;
        talentProfileId?: string;
        durationMinutes?: number | null;
      }>).detail;
      if (!d?.offeringId) return;
      setEventOffering({
        offeringId: d.offeringId,
        durationMinutes:
          typeof d.durationMinutes === "number" && d.durationMinutes > 0
            ? d.durationMinutes
            : offering.durationMinutes,
        timezone: offering.timezone,
        locationLabel: offering.locationLabel,
        talentProfileId: d.talentProfileId ?? offering.talentProfileId,
      });
      setSlot(null);
    };
    window.addEventListener("tulala:offering-slot", onSlot);
    return () => window.removeEventListener("tulala:offering-slot", onSlot);
  }, [offering]);

  function stampFromSlot(value: SlotPickerValue): ReservationStamp {
    return {
      v: 1,
      offering_id: active.offeringId,
      starts_at: value.startsAt,
      ends_at: value.endsAt,
      timezone: value.timezone,
      duration_minutes: active.durationMinutes,
      mode: "request",
    };
  }

  const initialIntent: InquiryIntent = slot
    ? applyReservationToIntent(baseIntent(active), stampFromSlot(slot))
    : baseIntent(active);

  return (
    <div>
      {showInlinePicker ? (
        <SlotPicker
          offeringId={active.offeringId}
          durationMinutes={active.durationMinutes}
          timezone={active.timezone}
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
          bookableOffering={active}
          initialIntent={initialIntent}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
