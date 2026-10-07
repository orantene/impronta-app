/**
 * TUL-77: workspace sites take bookings.
 *
 * The composer cannot know, at compose time, which services a tenant will
 * publish tomorrow, so the pages it writes carry a MARKED band whose children
 * are the honest static fallback (names only, or the inquiry form). At render
 * time the marker (the band's `layerLabel`) swaps the fallback for the live
 * published catalog or the real booking flow when something is bookable.
 *
 * Pure module: no server imports, safe for client and unit tests.
 */
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";
import type { TalentOffering } from "@/lib/talent/offerings-types";

/** Band holding the services list. Live catalog replaces the static cards. */
export const LIVE_SERVICES_LABEL = "Live services";
/** Band holding the booking form. Real booking flow replaces the inquiry form. */
export const LIVE_BOOKING_LABEL = "Live booking";

export type LiveServiceCard = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: string;
  durationMinutes: number | null;
  /** True when the visitor can pick a slot for it (a /book entry exists). */
  bookable: boolean;
};

export type LiveBookingSurface = {
  tenantSlug: string;
  agencyName: string;
  services: LiveServiceCard[];
  offerings: Array<
    TalentOffering & {
      bookingMode: "inquire" | "request" | "instant";
      seatsLabel: string | null;
    }
  >;
  signedIn: boolean;
  captcha: GuestCaptchaConfig | null;
};

export function isLiveServicesLabel(label: unknown): boolean {
  return label === LIVE_SERVICES_LABEL;
}

export function isLiveBookingLabel(label: unknown): boolean {
  return label === LIVE_BOOKING_LABEL;
}

/** Published offerings to service cards; `bookable` from the /book resolver. */
export function mergeServiceCards(
  published: Array<{
    id: string;
    title: string;
    description: string | null;
    amountCents: number | null;
    currency: string;
    durationMinutes: number | null;
    kind: string;
  }>,
  bookableIds: ReadonlySet<string>,
): LiveServiceCard[] {
  return published
    .filter((o) => o.kind !== "product")
    .map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      amountCents: o.amountCents,
      currency: o.currency || "USD",
      durationMinutes: o.durationMinutes,
      bookable: bookableIds.has(o.id),
    }));
}

