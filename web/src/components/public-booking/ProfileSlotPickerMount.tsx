"use client";

import { BookableComposer } from "@/components/public-booking/BookableComposer";
import { pickBookableOffering } from "@/components/public-booking/pick-bookable-offering";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function ProfileSlotPickerMount({
  offerings,
  tenantSlug,
  agencyName,
  locationLabel,
}: {
  offerings: TalentOffering[];
  tenantSlug: string;
  agencyName: string;
  locationLabel?: string | null;
}) {
  const offering = pickBookableOffering(offerings, { locationLabel });
  if (!offering || !tenantSlug) return null;
  return (
    <div className="mt-4">
      <BookableComposer
        tenantSlug={tenantSlug}
        agencyName={agencyName || "the studio"}
        offering={offering}
      />
    </div>
  );
}
