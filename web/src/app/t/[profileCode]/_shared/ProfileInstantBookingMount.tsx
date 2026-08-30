import { OfferingInstantMount } from "./OfferingInstantMount";
import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";
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
  return (
    <OfferingInstantMount
      tenantId={tenantId}
      sourcePage={sourcePage}
      locale={locale}
      signedIn={chrome.signedIn}
      captcha={chrome.captcha}
      hasBookableHours={hasBookableHours}
    />
  );
}
