import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { scopeToGuestSellableOfferings } from "@/lib/offerings/guest-sellable";
import { loadNonMenuOfferingIds, withoutNonMenuOfferings } from "@/lib/offerings/non-menu-offerings";
import {
  CATALOG_PROFILE_COLUMNS,
  CATALOG_PROFILE_CODE_RE,
  isPublicCatalogProfile,
  keepRowsOfPublicOwners,
  type CatalogProfileRow,
} from "@/lib/offerings/business-catalog";
import { logServerError } from "@/lib/server/safe-error";
import { loadOfferingChildren } from "@/lib/talent/offerings-children";
import { stripPublicOfferingFlightFields } from "@/lib/talent/offerings-public-strip";
import { rowToOffering, type TalentOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";
import { hideTestServiceOnPublicSite } from "@/lib/talent/qa-test-service";
import { loadTestServiceScope } from "@/lib/talent/qa-test-service.server";

/** Hard ceiling on rows read for one business; the API pages inside it. */
const BUSINESS_CATALOG_ROW_LIMIT = 500;
const ID_CHUNK = 100;

export type BusinessCatalogLoad =
  | { kind: "ok"; offerings: TalentOffering[]; talentCode: string | null; talentProfileId: string | null }
  /** The shared hub host lists no talent without an explicit profile. */
  | { kind: "talent_required" }
  /** Unknown, hidden, deleted or unlisted profile: one answer, nothing revealed. */
  | { kind: "profile_not_public" }
  | { kind: "unavailable" };

/**
 * The guest-sellable services of one host, for the public catalog API.
 *
 * - HUB host: the hub tenant is shared by every talent on the network, so the
 *   catalog is never listed by tenant alone. An explicit `profileCode` naming a
 *   PUBLIC profile (not deleted, not hidden, publicly listed) is required, and
 *   only that talent's rows are returned.
 * - AGENCY host: the workspace's own rows, plus talent-owned rows only while
 *   that talent's profile is public.
 * - Never the rows that back another product (ticketed events, the reservation
 *   offering): the same exclusion the menu, counter and QR menu use. If that
 *   list cannot be read the answer is `unavailable` (fail closed).
 * - Only guest-sellable (D-10) rows, and no QA test services.
 * Never throws.
 */
export async function loadBusinessCatalogOfferings(
  admin: SupabaseClient,
  input: { tenantId: string; hostKind: "agency" | "hub"; profileCode: string | null; locale: string },
): Promise<BusinessCatalogLoad> {
  try {
    let onlyTalentId: string | null = null;
    let talentCode: string | null = null;
    if (input.hostKind === "hub") {
      const code = input.profileCode?.trim() ?? "";
      if (!CATALOG_PROFILE_CODE_RE.test(code)) return { kind: "talent_required" };
      const { data, error } = await admin.from("talent_profiles").select(CATALOG_PROFILE_COLUMNS).eq("profile_code", code).maybeSingle();
      if (error) {
        logServerError("public.businessCatalog.profile", error);
        return { kind: "unavailable" };
      }
      const profile = data as CatalogProfileRow | null;
      if (!profile || !isPublicCatalogProfile(profile)) return { kind: "profile_not_public" };
      onlyTalentId = profile.id;
      talentCode = code;
    }

    const nonMenu = await loadNonMenuOfferingIds(admin, input.tenantId);
    if (nonMenu.error) {
      logServerError("public.businessCatalog.nonMenu", nonMenu.error);
      return { kind: "unavailable" };
    }

    let query = scopeToGuestSellableOfferings(admin.from("talent_offerings").select("*").eq("tenant_id", input.tenantId));
    if (onlyTalentId) query = query.eq("talent_profile_id", onlyTalentId);
    const { data, error } = await query.order("sort_order", { ascending: true }).limit(BUSINESS_CATALOG_ROW_LIMIT);
    if (error) {
      logServerError("public.businessCatalog.load", error);
      return { kind: "unavailable" };
    }
    let rows = withoutNonMenuOfferings((data ?? []) as TalentOfferingRow[], nonMenu.ids);

    if (!onlyTalentId) {
      // Talent-owned rows on an agency host: only while the talent is public.
      const talentIds = [...new Set(rows.map((r) => r.talent_profile_id).filter((v): v is string => !!v))];
      const publicIds = new Set<string>();
      for (let i = 0; i < talentIds.length; i += ID_CHUNK) {
        const { data: profs, error: pErr } = await admin
          .from("talent_profiles")
          .select(CATALOG_PROFILE_COLUMNS)
          .in("id", talentIds.slice(i, i + ID_CHUNK));
        if (pErr) {
          logServerError("public.businessCatalog.owners", pErr);
          return { kind: "unavailable" };
        }
        for (const p of (profs ?? []) as CatalogProfileRow[]) if (isPublicCatalogProfile(p)) publicIds.add(p.id);
      }
      rows = keepRowsOfPublicOwners(rows, publicIds);
    }

    const testScope = await loadTestServiceScope(admin, rows);
    rows = rows.filter((r) => !hideTestServiceOnPublicSite(r, testScope));
    if (rows.length === 0) return { kind: "ok", offerings: [], talentCode, talentProfileId: onlyTalentId };
    const children = await loadOfferingChildren(admin, rows.map((r) => r.id), { locale: input.locale });
    return {
      kind: "ok",
      talentCode,
      talentProfileId: onlyTalentId,
      offerings: rows.map((r) =>
        stripPublicOfferingFlightFields({ ...rowToOffering(r, input.locale, []), variants: children.variants.get(r.id) ?? [] }),
      ),
    };
  } catch (err) {
    logServerError("public.businessCatalog.load", err);
    return { kind: "unavailable" };
  }
}
