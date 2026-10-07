import "server-only";

import { loadGuestInstantChrome } from "@/lib/scheduling/guest-instant-chrome";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadPublicBookableOfferings } from "@/lib/site-admin/server/load-book-page-offerings";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { rowToOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";
import {
  mergeServiceCards,
  type LiveBookingSurface,
} from "@/lib/site-admin/builder-node/live-booking-markers";

/**
 * TUL-77: the published catalog a workspace site shows, and the real booking
 * flow's inputs. Services = every published, approved, public non-product
 * offering (house-owned AND roster talents'); `bookable` marks the ones the
 * /book flow can take (same resolver as /book, so the two never disagree).
 */
export async function loadLiveBookingSurface(
  tenantId: string,
  locale: string,
): Promise<LiveBookingSurface | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin || !tenantId) return null;
    const [offerings, rowsRes, agencyRes, identity, chrome] = await Promise.all([
      loadPublicBookableOfferings({
        tenantId,
        locale,
        host: { kind: "agency", tenantId },
      }),
      admin
        .from("talent_offerings")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .eq("moderation_state", "approved")
        .in("visibility", ["public", "on_request"])
        .order("sort_order", { ascending: true })
        .limit(48),
      admin.from("agencies").select("slug").eq("id", tenantId).maybeSingle<{ slug: string | null }>(),
      loadPublicIdentity(tenantId),
      loadGuestInstantChrome(tenantId),
    ]);
    if (rowsRes.error) logServerError("public.liveBooking.catalog", rowsRes.error);
    const published = ((rowsRes.data ?? []) as TalentOfferingRow[]).map((row) =>
      rowToOffering(row, locale, []),
    );
    const services = mergeServiceCards(published, new Set(offerings.map((o) => o.id)));
    return {
      tenantSlug: agencyRes.data?.slug?.trim() ?? "",
      agencyName: identity?.public_name?.trim() || "",
      services,
      offerings: offerings.map((o) => ({
        ...o,
        bookingMode: o.bookingMode === "instant" ? "instant" : "request",
      })),
      signedIn: chrome.signedIn,
      captcha: chrome.captcha,
    };
  } catch (error) {
    logServerError("public.liveBooking.surface", error);
    return null;
  }
}
