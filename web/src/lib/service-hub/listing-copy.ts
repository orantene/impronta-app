/**
 * TUL-1367 · Plain-language messages for listing statuses and refusals (EN/ES), from
 * dashboard.serviceHubListing in messages/*.json.
 */
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { ListingStatus } from "./listing";

const NS = "dashboard.serviceHubListing";

export function listingStatusLabel(status: ListingStatus, locale: string): string {
  return createTranslator(locale)(`${NS}.status_${status}`);
}

export function listingErrorMessage(
  error: string,
  locale: string,
  floor?: { cents: number; currency: string },
): string {
  const t = createTranslator(locale);
  switch (error) {
    case "below_floor":
      return interpolate(t(`${NS}.belowFloor`), {
        floor: floor ? formatDashboardMoneyCents(floor.cents, floor.currency, locale) : "",
      });
    case "exclusive_talent":
      return t(`${NS}.exclusiveOnly`);
    case "needs_consent":
    case "no_accepted_terms":
    case "outside_terms":
      return t(`${NS}.needsConsent`);
    case "floor_breached":
      return t(`${NS}.floorBreached`);
    default:
      return t(`${NS}.error`);
  }
}
