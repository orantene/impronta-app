import { HubBookHashBridge } from "./hub-book-hash-bridge";
import { ProfileInstantBookingMount } from "./_shared/ProfileInstantBookingMount";
import { BookingSheetReadyBeacon } from "@/components/public-booking/BookingSheetReadyBeacon";
import { CatalogBookingSheet } from "@/components/public-booking/CatalogBookingSheet";
import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";
import type { BookEntry } from "@/lib/talent-site/book-entry";

/**
 * Hub booking rails (TUL-246): `#book` hash bridge, catalog booking sheet when
 * the talent is bookable, and the existing instant-mount for product / no-slot
 * purchases. Renders nothing on agency hosts (platform-only).
 */
export async function HubProfileBookingChrome({
  platformHost,
  tenantId,
  talentProfileId,
  sourcePage,
  locale,
  bookEntry,
}: {
  platformHost: boolean;
  tenantId: string | null;
  talentProfileId: string;
  sourcePage: string;
  locale: string;
  bookEntry: BookEntry;
}) {
  if (!platformHost) return null;
  const bookable = bookEntry.kind === "sheet";
  const chrome = tenantId && bookable ? await loadGuestInstantChrome(tenantId) : null;
  return (
    <>
      <HubBookHashBridge bookEntry={bookEntry} />
      {tenantId && bookable ? (
        <>
          <CatalogBookingSheet
            locale={locale}
            mode="live"
            tenantId={tenantId}
            captcha={chrome?.captcha ?? null}
          />
          <BookingSheetReadyBeacon />
        </>
      ) : null}
      {tenantId ? (
        <ProfileInstantBookingMount
          tenantId={tenantId}
          talentProfileId={talentProfileId}
          sourcePage={sourcePage}
          locale={locale}
        />
      ) : null}
    </>
  );
}
