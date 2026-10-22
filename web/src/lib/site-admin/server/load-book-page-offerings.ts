import "server-only";

import { withEffectiveBookingModes } from "@/lib/talent/effective-booking-mode-loader";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isSlotEligibleOffering } from "@/components/public-booking/pick-bookable-offering";
import { resolveTalentBookingMode, type TalentBookingMode } from "@/lib/scheduling/booking-surface";
import { houseListingModeFor, houseOnlineBooking } from "@/lib/booking/house-booking";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePinnedOfferingId(raw: string | null | undefined): string {
  const id = (raw ?? "").trim();
  return UUID_RE.test(id) ? id : "";
}

export async function loadPublicBookableOfferings(args: {
  tenantId?: string | null;
  talentProfileId?: string | null;
  locale?: string;
  host?: { kind: string; tenantId?: string | null };
  /**
   * TUL-65 Book again: the service id from `/book?service=`. It is kept in the
   * list even when it would normally be dropped (QA-named on a test account,
   * past the 24-row cap, request-only, no hours, roster not released), so the
   * visitor lands on THEIR service with the right path instead of an empty
   * sheet. It still has to pass the sellable scope in this tenant: a forged id
   * can only surface what the public could already ask for.
   */
  pinnedOfferingId?: string | null;
  /**
   * TUL-1471: offerings of a workspace's roster talent that an INSTANT hub entry sells. They belong to
   * the talent, not the workspace, so the tenant filter alone drops them and the widget could not book
   * a hub entry. They still pass the sellable scope and the same booking-mode resolver as the rest.
   */
  extraOfferingIds?: readonly string[];
}): Promise<Array<TalentOffering & { bookingMode: TalentBookingMode; seatsLabel: string | null; hasOpenTimes?: boolean | null; hasSessions?: boolean }>> {
  if (!args.tenantId && !args.talentProfileId) return [];
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    let query = scopeToSellableOfferings(admin.from("talent_offerings").select("*"), "guest_request");
    const extraIds = (args.extraOfferingIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (args.tenantId && extraIds.length > 0) query = query.or(`tenant_id.eq.${args.tenantId},id.in.(${extraIds.join(",")})`);
    else if (args.tenantId) query = query.eq("tenant_id", args.tenantId);
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
    const pinnedId = normalizePinnedOfferingId(args.pinnedOfferingId);
    if (pinnedId && !loaded.some((r) => r.id === pinnedId)) {
      // Past the row cap: fetch it on its own, same tenant + sellable scope.
      let one = scopeToSellableOfferings(admin.from("talent_offerings").select("*"), "guest_request").eq("id", pinnedId);
      if (args.tenantId) one = one.eq("tenant_id", args.tenantId);
      if (args.talentProfileId) one = one.eq("talent_profile_id", args.talentProfileId);
      const { data: extra } = await one.maybeSingle();
      if (extra) loaded.push(extra as TalentOfferingRow);
    }
    const testScope = await loadTestServiceScope(admin, loaded);
    const rows = loaded.filter((r) => r.id === pinnedId || !hideTestServiceOnPublicSite(r, testScope));
    const offerings = await withEffectiveBookingModes(
      admin,
      rows.map((row) => rowToOffering(row, args.locale ?? "en", [])),
    );
    const host = args.host ?? {
      kind: args.tenantId ? "agency" : "talent_site",
      tenantId: args.tenantId ?? null,
    };
    // TUL-1381: a class sells its scheduled sessions (session_series -> sessions), not a
    // talent calendar, so it never has slots and used to read "no online times". Offerings
    // with upcoming sessions are listed with the session picker instead.
    const sessionOfferingIds = args.tenantId
      ? await loadOfferingIdsWithUpcomingSessions(admin, args.tenantId, offerings.map((o) => o.id))
      : new Set<string>();
    const kept: Array<TalentOffering & { bookingMode: TalentBookingMode; seatsLabel: string | null; hasOpenTimes?: boolean | null; hasSessions?: boolean }> = [];
    for (const offering of offerings) {
      const isPinned = offering.id === pinnedId;
      if (sessionOfferingIds.has(offering.id)) {
        kept.push({ ...offering, bookingMode: "instant", seatsLabel: null, hasOpenTimes: true, hasSessions: true });
        continue;
      }
      if (!isSlotEligibleOffering(offering)) {
        if (isPinned && offering.kind !== "product") kept.push({ ...offering, bookingMode: "inquire", seatsLabel: null });
        continue;
      }

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
        // TUL-1915: the same decision the item editor badge reads.
        // A pinned service (TUL-65) is still kept, as an enquiry, so the visitor lands on it.
        if (houseOnlineBooking(offering).state !== "request") {
          if (isPinned) kept.push({ ...offering, bookingMode: "inquire", seatsLabel: null });
          continue;
        }
        // Never "instant": the slots route refuses house rows (item 6).
        const houseMode = houseListingModeFor(offering, host);
        if (houseMode !== "inquire" || isPinned) kept.push({ ...offering, bookingMode: houseMode, seatsLabel: null });
        continue;
      }

      const mode = await resolveTalentBookingMode(admin, {
        talentProfileId: offering.talentProfileId,
        offeringId: offering.id,
        host,
      });
      if (mode !== "inquire" || isPinned) kept.push({ ...offering, bookingMode: mode, seatsLabel: null });
    }
    // B2/D3: tell the page which services have times (capped probe).
    await annotateOpenTimes(admin, kept.filter((o) => !o.hasSessions), {
      host: {
        kind: args.tenantId ? "agency" : host.kind,
        tenantId: args.tenantId ?? host.tenantId ?? null,
      },
      talentSiteId: args.talentProfileId ?? null,
      priorityId: pinnedId || null,
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

const SESSION_HORIZON_DAYS = 90;

/** Offering ids (of the given list) that have a scheduled session ahead, tenant-scoped. */
export async function loadOfferingIdsWithUpcomingSessions(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  offeringIds: readonly string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  const out = new Set<string>();
  if (offeringIds.length === 0) return out;
  const horizon = new Date(now.getTime() + SESSION_HORIZON_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("sessions")
    .select("offering_id")
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", horizon)
    .in("offering_id", offeringIds as string[])
    .limit(500);
  // A failed read leaves classes on the old path rather than hiding a bookable service.
  if (error) {
    logServerError("public.book.sessions", error);
    return out;
  }
  for (const row of data ?? []) {
    if (typeof row.offering_id === "string") out.add(row.offering_id);
  }
  return out;
}
