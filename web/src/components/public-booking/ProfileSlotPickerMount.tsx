"use client";

import { BookableComposer } from "@/components/public-booking/BookableComposer";
import { pickBookableOffering } from "@/components/public-booking/pick-bookable-offering";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingMode } from "@/lib/scheduling/booking-surface";

export function ProfileSlotPickerMount({
  offerings,
  tenantSlug,
  tenantId,
  agencyName,
  locationLabel,
  bookingMode = "request",
}: {
  offerings: TalentOffering[];
  tenantSlug: string;
  tenantId?: string | null;
  agencyName: string;
  locationLabel?: string | null;
  bookingMode?: TalentBookingMode;
}) {
  const offering = pickBookableOffering(offerings, { locationLabel });
  if (!offering || !tenantSlug) return null;
  return (
    <div className="mt-4">
      <BookableComposer
        tenantSlug={tenantSlug}
        tenantId={tenantId}
        agencyName={agencyName || "the studio"}
        offering={offering}
        bookingMode={bookingMode}
      />
    </div>
  );
}
