import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { parseTalentBookingTerms, parseTenantCommercialTerms } from "@/lib/billing/commercial-terms";
import { normalizeServicesMenu, findInstantBookService } from "@/lib/talent/services-menu-types";

/**
 * Instant-book ELIGIBILITY — a read, not a purchase.
 *
 * Lifted out of `instant-book-engine.ts` when that engine was deleted, because
 * it never belonged to it: it answers "can this talent be booked instantly and
 * at what price" for the public profile and the CTA precedence rules. It writes
 * nothing, takes no money, and holds nothing.
 *
 * Folding it into the purchase pipeline would have been the easy move and the
 * wrong one — the pipeline's job is to make a sale happen, and a read that
 * decides whether to show a button has no business inside it.
 */

export type InstantBookEligibility = {
  eligible: boolean;
  fixedRateCents: number | null;
  fixedRateDollars: number | null;
  currencyCode: string;
};

/**
 * Eligibility for the public talent-profile CTA. Reads the talent opt-in +
 * fixed rate and the tenant switch; returns the display rate. Pure read.
 */
export async function loadInstantBookEligibility(
  talentProfileId: string,
  tenantId: string,
  currencyCode = "USD",
): Promise<InstantBookEligibility> {
  const out: InstantBookEligibility = {
    eligible: false,
    fixedRateCents: null,
    fixedRateDollars: null,
    currencyCode,
  };
  const admin = createServiceRoleClient();
  if (!admin) return out;
  try {
    const [{ data: tp }, { data: ag }] = await Promise.all([
      admin
        .from("talent_profiles")
        .select("booking_terms, services_menu")
        .eq("id", talentProfileId)
        .maybeSingle(),
      admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle(),
    ]);
    const talentTerms = parseTalentBookingTerms(tp?.booking_terms ?? null);
    const tenantTerms = parseTenantCommercialTerms(ag?.settings ?? null);
    // S16 — a services-menu service flagged instant-book (priced, active) is the
    // newer talent-facing surface; it drives instant-book and takes precedence
    // over the legacy booking_terms.fixedRateCents. Its presence also satisfies
    // opt-in (flagging a service IS opting in for that service).
    const menuItem = findInstantBookService(
      normalizeServicesMenu((tp as { services_menu?: unknown } | null)?.services_menu),
    );
    const menuRateCents = menuItem?.amountCents ?? null;
    const optIn = talentTerms?.instantBookOptIn === true || menuItem != null;
    const fixed = menuRateCents ?? talentTerms?.fixedRateCents ?? null;
    const tenantOn = tenantTerms?.instantBookEnabled === true;
    out.fixedRateCents = fixed;
    out.fixedRateDollars = fixed != null ? fixed / 100 : null;
    out.eligible = optIn && tenantOn && fixed != null && fixed > 0;
    return out;
  } catch (err) {
    logServerError("instantBook.eligibility", err);
    return out;
  }
}
