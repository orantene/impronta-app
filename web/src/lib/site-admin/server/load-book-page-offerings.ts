import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isSlotEligibleOffering } from "@/components/public-booking/pick-bookable-offering";
import { resolveTalentBookingMode, type TalentBookingMode } from "@/lib/scheduling/booking-surface";
import { houseBookingModeFor } from "@/lib/booking/house-booking";
import {
  rowToOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";

export type BookableOffering = TalentOffering & { bookingMode: TalentBookingMode };

/**
 * `ok: false` means WE COULD NOT ANSWER, and it exists so the page can stop
 * claiming otherwise.
 *
 * Every failure here used to return `[]`, which the page rendered as "No open
 * times in the next two weeks." That is a claim about the world, made from a
 * failed query. A visitor to a real agency site was told it was fully booked
 * for a fortnight because a database read errored, and nothing in any log
 * distinguished that from a genuinely quiet calendar.
 *
 * An empty `ok: true` is a real answer: the query ran, the filters applied, and
 * nothing came back. Those two need different sentences, so they need different
 * shapes.
 */
export type BookableOfferingsResult =
  | { ok: true; offerings: BookableOffering[] }
  | { ok: false };

export async function loadPublicBookableOfferings(args: {
  tenantId?: string | null;
  talentProfileId?: string | null;
  locale?: string;
  host?: { kind: string; tenantId?: string | null };
}): Promise<BookableOfferingsResult> {
  if (!args.tenantId && !args.talentProfileId) return { ok: false };
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    let query = admin
      .from("talent_offerings")
      .select("*")
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .in("visibility", ["public", "on_request"])
      // ELIGIBILITY BELONGS IN THE QUERY, NOT AFTER THE LIMIT.
      //
      // These three predicates mirror `isSlotEligibleOffering` exactly, and they
      // are here because `.limit(24)` used to run BEFORE them: the query took 24
      // arbitrary rows by `sort_order` and only then discarded the ineligible
      // ones. On a tenant with 155 published offerings of which 5 are
      // bookable, that keeps none, and the page renders "no open times" for a
      // studio with a full menu. Measured on Impronta: 24 rows sampled, all at
      // sort_order 0, one eligible, zero surviving.
      //
      // With the predicates in SQL the limit applies to eligible rows, which is
      // what it always meant. `isSlotEligibleOffering` is still called below and
      // stays the single definition; this is the same rule pushed down, not a
      // second copy of it.
      .gt("duration_minutes", 0)
      .neq("kind", "product")
      .in("booking_mode", ["request", "instant"]);
    if (args.tenantId) query = query.eq("tenant_id", args.tenantId);
    if (args.talentProfileId) {
      query = query.eq("talent_profile_id", args.talentProfileId);
    }
    const { data, error } = await query
      .order("sort_order", { ascending: true })
      .limit(24);
    if (error) {
      logServerError("public.book.offerings", error);
      return { ok: false };
    }
    const rows = (data ?? []) as TalentOfferingRow[];
    const offerings = rows.map((row) => rowToOffering(row, args.locale ?? "en", []));
    const host = args.host ?? {
      kind: args.tenantId ? "agency" : "talent_site",
      tenantId: args.tenantId ?? null,
    };
    const kept: BookableOffering[] = [];
    for (const offering of offerings) {
      if (!isSlotEligibleOffering(offering)) continue;

      // HOUSE-OWNED offerings (F8). Slot booking used to skip anything without
      // a talent, which is why a salon, a barber, a spa and a clinic all got a
      // blank /book page: a "Fade, 30 minutes" is a house service on a chair,
      // not a person's calendar. Capacity 0.2 made "N units of a chair over a
      // window" expressible, so the house path is now real.
      //
      // The house resolver lives in `lib/booking/house-booking.ts` and CALLS
      // the Appointments Manager's primitives rather than reimplementing them,
      // so this is one rule with two entry points. `booking-surface.ts` stays
      // person-shaped and untouched.
      if (!offering.talentProfileId) {
        const houseMode = houseBookingModeFor(offering, host);
        if (houseMode !== "inquire") kept.push({ ...offering, bookingMode: houseMode });
        continue;
      }

      const mode = await resolveTalentBookingMode(admin, {
        talentProfileId: offering.talentProfileId,
        offeringId: offering.id,
        host,
      });
      if (mode !== "inquire") kept.push({ ...offering, bookingMode: mode });
    }
    return { ok: true, offerings: kept };
  } catch (err) {
    logServerError("public.book.offerings", err);
    return { ok: false };
  }
}
