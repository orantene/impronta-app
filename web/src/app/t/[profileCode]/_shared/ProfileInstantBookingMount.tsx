import { OfferingInstantMount } from "./OfferingInstantMount";
import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { talentHasBookableHours } from "@/lib/scheduling/instant-book-hours";

export async function ProfileInstantBookingMount({
  tenantId,
  talentProfileId,
  sourcePage,
  locale,
}: {
  tenantId: string;
  talentProfileId: string;
  sourcePage: string;
  locale: string;
}) {
  const chrome = await loadGuestInstantChrome(tenantId);
  const admin = createServiceRoleClient();
  const hasBookableHours = admin
    ? await talentHasBookableHours(admin, talentProfileId)
    : false;
  let requestOnly = true;
  if (admin) {
    const { data } = await admin.from("talent_profiles").select("talent_plan_key").eq("id", talentProfileId).maybeSingle();
    requestOnly = !talentOffersInstantBooking((data as { talent_plan_key?: string | null } | null)?.talent_plan_key);
  }
  return (
    <OfferingInstantMount
      tenantId={tenantId}
      sourcePage={sourcePage}
      locale={locale}
      signedIn={chrome.signedIn}
      captcha={chrome.captcha}
      hasBookableHours={hasBookableHours}
      requestOnly={requestOnly}
    />
  );
}
