import "server-only";

/**
 * Public storefront loader — the offerings a VISITOR may see on /t/[code].
 *
 * Server-only (imported by the public profile page). Uses the service-role
 * client for one cheap query but re-applies the public-visibility filter in
 * code (published ∧ approved ∧ not agency_only), matching the table's anon
 * RLS policy exactly — so this loader can never leak more than anon RLS would.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { cachePublicTalentSiteData } from "@/lib/talent-site/server/public-site-data-cache.server";
import { loadOfferingChildren } from "./offerings-children";
import {
  loadAddonGroupsForOfferings,
  mergeAddonGroupsIntoAddOns,
} from "./merge-addon-groups";
import {
  rowToOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";
import { withEffectivePolicy, withPublicAvailability } from "@/lib/talent/offering-policy-resolver";
import { loadTalentSiteSwitches, loadWorkingHoursPresence } from "@/lib/talent/site-switches-server";
import { isPlatformCheckoutReady } from "@/lib/talent/online-collect-ready";
import { publicContactMode } from "@/lib/talent/accepting-readiness";
import { loadSellingDefaultsByTalent } from "@/lib/talent/offering-policy-server";
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";
import { stripPublicOfferingFlightFields } from "@/lib/talent/offerings-public-strip";

export async function loadPublicOfferingsForProfile(
  talentProfileId: string,
  locale: string,
  /**
   * Viewing agency, when the profile is rendered on an AGENCY host.
   *
   * A services catalog belongs to one agency relationship
   * (`talent_offerings.tenant_id`), and a talent can sit on several rosters
   * with different negotiated rates. Scoping here stops Agency A's catalog
   * from appearing on Agency B's storefront — the same isolation already
   * enforced for directory cards in lib/directory/price-from.ts.
   *
   * null/undefined = no agency context (the talent's own premium site, or a
   * platform host), where showing everything they offer is correct.
   */
  tenantId?: string | null,
  /** WSF-C §7: "agency" skips the talent's switches (default: direct unless tenantId). */
  opts?: { channel?: "direct" | "agency"; chain?: readonly string[]; bypassCache?: boolean },
): Promise<TalentOffering[]> {
  const localeKey = locale.trim().toLowerCase() || "en";
  const channel = opts?.channel ?? (tenantId ? "agency" : "direct");
  const chainKey = (opts?.chain ?? []).join(",");
  // Public catalog only — never guest-keyed. 120s TTL bounds staleness when
  // an offering edits without a site publish (publish still busts the tag).
  // Owner/edit/preview passes bypassCache so a save is visible immediately.
  return cachePublicTalentSiteData(
    talentProfileId,
    "offerings",
    [localeKey, tenantId ?? "", channel, chainKey],
    () => loadPublicOfferingsForProfileUncached(talentProfileId, locale, tenantId, opts),
    { revalidate: 120, bypass: opts?.bypassCache },
  );
}

async function loadPublicOfferingsForProfileUncached(
  talentProfileId: string,
  locale: string,
  tenantId?: string | null,
  opts?: { channel?: "direct" | "agency"; chain?: readonly string[] },
): Promise<TalentOffering[]> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];
    const db = admin;

    let query = db
      .from("talent_offerings")
      .select("*")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .in("visibility", ["public", "on_request"]);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query.order("sort_order", { ascending: true });
    if (error) {
      logServerError("public.offerings.load", error);
      return [];
    }
    const rows = (data ?? []) as TalentOfferingRow[];
    if (rows.length === 0) return [];

    const { data: mediaRows } = await db
      .from("talent_offering_media")
      .select("offering_id, sort_order, media_assets:media_asset_id ( public_url, bucket_id, storage_path )")
      .in("offering_id", rows.map((r) => r.id))
      .order("sort_order", { ascending: true });
    type MediaJoin = { public_url: string | null; bucket_id: string | null; storage_path: string | null };
    type MediaRow = { offering_id: string; media_assets: MediaJoin | MediaJoin[] | null };
    const images = new Map<string, string[]>();
    for (const r of (mediaRows ?? []) as MediaRow[]) {
      const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
      if (!m) continue;
      // Canonical resolution (matches talent-dashboard-data): public_url when
      // set, else the media-public bucket's storage public URL.
      let url = m.public_url ?? null;
      if (!url && m.bucket_id === "media-public" && m.storage_path) {
        url = db.storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
      }
      if (!url) continue;
      const list = images.get(r.offering_id) ?? [];
      list.push(url);
      images.set(r.offering_id, list);
    }
    // D4 — attach the public options/extras (RLS-mirrored child tables).
    const children = await loadOfferingChildren(db, rows.map((r) => r.id), { locale });
    const groups = await loadAddonGroupsForOfferings(
      db,
      talentProfileId,
      rows.map((r) => r.id),
      { locale },
    );
    const addOnsByOffering = mergeAddonGroupsIntoAddOns(children.addOns, groups);
    // The talent's Defaults (deposit, cancellation) apply where the offering
    // left them unset, so the sheet says what checkout will charge.
    const defaults = await loadSellingDefaultsByTalent(db, [talentProfileId]);
    const sellingDefaults = defaults.ok ? (defaults.defaults.get(talentProfileId) ?? {}) : {};
    // WSF-C: readiness everywhere; the talent's switches only on a direct
    // channel (no agency context, §7).
    const [switches, hours, plan] = await Promise.all([
      tenantId || opts?.channel === "agency" ? Promise.resolve(null) : loadTalentSiteSwitches(db, talentProfileId),
      loadWorkingHoursPresence(db, [talentProfileId]),
      loadPlanAllowsInstant(db, [talentProfileId]),
    ]);
    const availability = {
      switches,
      hasWorkingHours: hours.get(talentProfileId) ?? null,
      payoutsReady: isPlatformCheckoutReady(),
      // F27: agency-routed catalogs follow the agency's plan, not hers.
      planAllowsInstant: tenantId ? undefined : plan.get(talentProfileId),
    };
    const pause = switches ? publicContactMode(switches) : "open";
    return rows.map((r) => {
      const full: TalentOffering = {
        ...(pause !== "open" ? { publicPause: pause } : {}),
        ...withPublicAvailability(
          withEffectivePolicy(rowToOffering(r, locale, images.get(r.id) ?? [], opts?.chain), sellingDefaults),
          sellingDefaults,
          availability,
        ),
        variants: children.variants.get(r.id) ?? [],
        addOns: addOnsByOffering.get(r.id) ?? [],
      };
      return stripPublicOfferingFlightFields(full);
    });
  } catch (err) {
    logServerError("public.offerings.load", err);
    return [];
  }
}
