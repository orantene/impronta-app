import { ProfileSlotPickerMount } from "@/components/public-booking/ProfileSlotPickerMount";
import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingMode } from "@/lib/scheduling/booking-surface";

export async function ProfileSlotPickerChrome({
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
  const chrome = await loadGuestInstantChrome(tenantId);
  return (
    <ProfileSlotPickerMount
      offerings={offerings}
      tenantSlug={tenantSlug}
      tenantId={tenantId}
      agencyName={agencyName}
      locationLabel={locationLabel}
      bookingMode={bookingMode}
      signedIn={chrome.signedIn}
      captcha={chrome.captcha}
    />
  );
}
