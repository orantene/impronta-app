import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isSlotEligibleOffering } from "@/components/public-booking/pick-bookable-offering";
import { resolveTalentBookingMode } from "@/lib/scheduling/booking-surface";
import {
  rowToOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";

export async function loadPublicBookableOfferings(args: {
  tenantId?: string | null;
  talentProfileId?: string | null;
  locale?: string;
  host?: { kind: string; tenantId?: string | null };
}): Promise<TalentOffering[]> {
  if (!args.tenantId && !args.talentProfileId) return [];
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    let query = admin
      .from("talent_offerings")
      .select("*")
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .in("visibility", ["public", "on_request"]);
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
    const rows = (data ?? []) as TalentOfferingRow[];
    const offerings = rows.map((row) => rowToOffering(row, args.locale ?? "en", []));
    const host = args.host ?? {
      kind: args.tenantId ? "agency" : "talent_site",
      tenantId: args.tenantId ?? null,
    };
    const kept: TalentOffering[] = [];
    for (const offering of offerings) {
      if (!isSlotEligibleOffering(offering)) continue;
      const mode = await resolveTalentBookingMode(admin, {
        talentProfileId: offering.talentProfileId,
        offeringId: offering.id,
        host,
      });
      if (mode !== "inquire") kept.push(offering);
    }
    return kept;
  } catch (err) {
    logServerError("public.book.offerings", err);
    return [];
  }
}
