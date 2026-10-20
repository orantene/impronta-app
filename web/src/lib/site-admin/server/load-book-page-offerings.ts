import "server-only";

import { withEffectiveBookingModes } from "@/lib/talent/effective-booking-mode-loader";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isSlotEligibleOffering } from "@/components/public-booking/pick-bookable-offering";
import { resolveTalentBookingMode, type TalentBookingMode } from "@/lib/scheduling/booking-surface";
import { houseListingModeFor } from "@/lib/booking/house-booking";
import {
  rowToOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";
import { loadOfferingSeats } from "@/lib/sessions/offering-seats";
import { hideTestServiceOnPublicSite } from "@/lib/talent/qa-test-service";
import { loadTestServiceScope } from "@/lib/talent/qa-test-service.server";
import { describeSeatsLeft, seatsLeft } from "@/lib/sessions/seats-left";
import { annotateOpenTimes } from "@/lib/site-admin/server/annotate-open-times";
import { scopeToSellableOfferings } from "@/lib/offerings/sellable";

export async function loadPublicBookableOfferings(args: {
  tenantId?: string | null;
  talentProfileId?: string | null;
  locale?: string;
  host?: { kind: string; tenantId?: string | null };
}): Promise<Array<TalentOffering & { bookingMode: TalentBookingMode; seatsLabel: string | null; hasOpenTimes?: boolean | null }>> {
  if (!args.tenantId && !args.talentProfileId) return [];
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    let query = scopeToSellableOfferings(admin.from("talent_offerings").select("*"), "guest_request");
    if (args.tenantId) query = query.eq("tenant_id", args.tenantId);
    if (args.talentProfileId) {
      query = query.eq("talent_profile_id", args.talentProfileId);
    }
    const { data, error } = await query
      .order("sort_order", { ascending: true })
      .limit(24);
    if (error) {
      logServerError("public.book.offerings", error);
      return [];
    }
    const loaded = (data ?? []) as TalentOfferingRow[];
    const testScope = await loadTestServiceScope(admin, loaded);
    const rows = loaded.filter((r) => !hideTestServiceOnPublicSite(r, testScope));
    const offerings = await withEffectiveBookingModes(
      admin,
      rows.map((row) => rowToOffering(row, args.locale ?? "en", [])),
    );
    const host = args.host ?? {
      kind: args.tenantId ? "agency" : "talent_site",
      tenantId: args.tenantId ?? null,
    };
    const kept: Array<TalentOffering & { bookingMode: TalentBookingMode; seatsLabel: string | null; hasOpenTimes?: boolean | null }> = [];
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
        // Never "instant": the slots route refuses house rows (item 6).
        const houseMode = houseListingModeFor(offering, host);
        if (houseMode !== "inquire") kept.push({ ...offering, bookingMode: houseMode, seatsLabel: null });
        continue;
      }

      const mode = await resolveTalentBookingMode(admin, {
        talentProfileId: offering.talentProfileId,
        offeringId: offering.id,
        host,
      });
      if (mode !== "inquire") kept.push({ ...offering, bookingMode: mode, seatsLabel: null });
    }
    // B2/D3: tell the page which services have times (capped probe).
    await annotateOpenTimes(admin, kept, {
      host: {
        kind: args.tenantId ? "agency" : host.kind,
        tenantId: args.tenantId ?? host.tenantId ?? null,
      },
      talentSiteId: args.talentProfileId ?? null,
    });
    // Seats last, on the kept list only: a cohort count for an offering nobody
    // can book is a query for nothing. Absent pool means absent entry means no
    // badge, which is why this cannot turn an unlimited service into "Sold out".
    if (args.tenantId && kept.length > 0) {
      const seats = await loadOfferingSeats(
        admin,
        args.tenantId,
        kept.map((o) => o.id),
      );
      for (const offering of kept) {
        const found = seats.get(offering.id);
        if (!found) continue;
        offering.seatsLabel = describeSeatsLeft(
          seatsLeft(found.remaining, found.total),
          args.locale ?? "en",
        );
      }
    }

    return kept;
  } catch (err) {
    logServerError("public.book.offerings", err);
    return [];
  }
}
