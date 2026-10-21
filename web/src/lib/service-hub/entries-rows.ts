/**
 * entries-rows.ts — database rows (workspace_service_listings #4159 plus the
 * talent's offering) to the pure `EntryListing`. No I/O. TUL-1369.
 */
import type { BookingType, EntryListing } from "./entries";

type Raw = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number.parseInt(v, 10) : null);

/** Categories are free text on the offering: compare trimmed, lower case, without accents. */
export function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  return t || null;
}

export function listingFromRows(listing: Raw, offering: Raw, talentName: string): EntryListing | null {
  const listingId = str(listing.id);
  const talentProfileId = str(listing.talent_profile_id);
  const status = str(listing.status);
  const mode = str(listing.price_mode);
  if (!listingId || !talentProfileId || !status || !mode) return null;
  if (status === "hidden") return null;
  const own = int(offering.amount_cents);
  let priceCents: number | null = null;
  if (mode === "talent_price") priceCents = own;
  else if (mode === "margin") {
    const bps = int(listing.margin_bps);
    priceCents = own != null && bps != null ? own + Math.round((own * bps) / 10000) : null;
  } else if (mode === "fixed" || mode === "from") priceCents = int(listing.price_cents);
  const bookingType: BookingType = listing.booking_type === "instant" ? "instant" : "request";
  return {
    listingId,
    talentProfileId,
    talentName,
    title: str(offering.title) ?? "",
    categoryId: normalizeCategory(offering.category),
    durationMinutes: int(offering.duration_minutes),
    bookingType,
    priceCents,
    currency: str(listing.currency) ?? str(offering.currency) ?? "",
    entryId: str(listing.entry_id),
    // She consented and the owner has not skipped it.
    talentAccepted: status === "accepted" && !listing.owner_skipped_at,
  };
}
