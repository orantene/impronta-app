/**
 * Pure helpers for the booking-confirmed emails (TUL-852/853).
 *
 * No I/O, no server-only: the templates, the hydrator and the tests all import
 * this. The hydrator (catalog-audiences-booking.ts) reads the rows; this file
 * only decides how they read in the email.
 */
import { formatDashboardMoney } from "@/lib/money/dashboard-money-format";

/** "Hi Ana," / "Hola Ana,"; a missing or blank name drops to "Hi," / "Hola,". */
export function bookingGreeting(
  t: { greetingNamed: string; greetingAnon: string },
  name: string | null | undefined,
): string {
  const n = name?.trim();
  return n ? t.greetingNamed.replace("{name}", n) : t.greetingAnon;
}

/**
 * The service the guest booked. The storefront offering title wins; the
 * booking's own title is used only when it is a real title, not the column
 * default ("Booking") or the guest's own name.
 */
export function pickServiceName(input: {
  offeringTitle?: string | null;
  bookingTitle?: string | null;
  contactName?: string | null;
}): string | null {
  const offering = input.offeringTitle?.trim();
  if (offering) return offering;
  const title = input.bookingTitle?.trim();
  if (!title) return null;
  const lower = title.toLowerCase();
  if (lower === "booking" || lower === "reserva") return null;
  if (input.contactName && lower === input.contactName.trim().toLowerCase()) return null;
  return title;
}

/**
 * Price in the booking's own currency ("$800 MXN"). Null when the amount is
 * missing, not positive, or no currency is known: a price is never printed in a
 * guessed currency.
 */
export function formatBookingPrice(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const code = (currency ?? "").trim().toUpperCase();
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return formatDashboardMoney(value, code, locale ?? "en");
}

/**
 * TUL-853: whose name the confirmation carries. The platform hub is only the
 * marketplace: a hub sale is the talent's own sale, so the email is signed by
 * the talent when exactly one is booked. A talent's own workspace is signed by
 * the talent too. Any other workspace keeps its own brand (null = no override).
 */
export function bookingSellerName(input: {
  workspaceType: string | null;
  kind: string | null;
  planTier: string | null;
  /** Display names of the talent on the booking (trimmed, non-empty). */
  talentNames: string[];
  /** The owner talent of a talent workspace, when resolved. */
  ownerTalentName?: string | null;
}): string | null {
  if (input.workspaceType === "talent") return input.ownerTalentName?.trim() || null;
  if (input.kind === "hub" && input.planTier === "network") {
    const names = [...new Set(input.talentNames.map((n) => n.trim()).filter(Boolean))];
    return names.length === 1 ? names[0] : null;
  }
  return null;
}

/** The email brand with the seller's name in place of the workspace's. */
export function brandForSeller<B extends { wordmark?: string; accountName?: string; logoUrl?: string | null }>(
  brand: B,
  sellerName: string | null | undefined,
): B {
  const name = sellerName?.trim();
  if (!name || name === brand.accountName) return brand;
  return { ...brand, wordmark: name.toUpperCase(), accountName: name, logoUrl: null };
}
