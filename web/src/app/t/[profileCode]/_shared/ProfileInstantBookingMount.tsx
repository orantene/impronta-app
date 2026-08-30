import { OfferingInstantMount } from "./OfferingInstantMount";
import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";

export async function ProfileInstantBookingMount({
  tenantId,
  sourcePage,
  locale,
}: {
  tenantId: string;
  sourcePage: string;
  locale: string;
}) {
  const chrome = await loadGuestInstantChrome(tenantId);
  return (
    <OfferingInstantMount
      tenantId={tenantId}
      sourcePage={sourcePage}
      locale={locale}
      signedIn={chrome.signedIn}
      captcha={chrome.captcha}
    />
  );
}
