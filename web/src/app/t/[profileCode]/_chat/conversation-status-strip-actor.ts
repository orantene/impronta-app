/**
 * Pure actor label for ConversationStatusStrip. Kept free of "use client" so
 * the unit test can import it without dragging the React strip.
 */
import { interpolate } from "@/i18n/interpolate";

/** First name only, so the reassurance reads human ("Maya is on it"). */
function firstNameOf(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function resolveStatusStripActor(args: {
  omitPlatformBrand: boolean;
  brandAgencyName: string;
  receiptAgencyName: string | null | undefined;
  coordinatorDisplayName: string | null | undefined;
  stripActorFromAgency: string;
}): string {
  const brand = args.brandAgencyName.trim();
  if (args.omitPlatformBrand) {
    // Solo dock: brand voice only. Receipt.agencyName is the hub/platform
    // tenant (often "Tulala") and must not leak onto a personal site.
    return brand;
  }
  const resolvedAgency = (args.receiptAgencyName?.trim() || brand).trim();
  const coordinatorFirst = args.coordinatorDisplayName
    ? firstNameOf(args.coordinatorDisplayName)
    : "";
  if (coordinatorFirst) {
    return interpolate(args.stripActorFromAgency, {
      first: coordinatorFirst,
      agency: resolvedAgency,
    });
  }
  return resolvedAgency;
}
