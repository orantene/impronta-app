/**
 * pageless-fallback.server.ts — what a tenant with NO published homepage
 * renders: its family's default Look, its type's components (folded onto the
 * one page it has, `pageless-home.ts`) in their honest empty state, lifestyle
 * stock, and the owner's identity. Never blank, never a
 * fictional business (docs/plans/templates/01-plan.md §4; D-TPL-17).
 *
 * Read-only: nothing is written, so a page-less tenant keeps rendering this
 * until it composes or publishes. Cheap enough for a live request: one
 * settings read, one stock read, no model call.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { queryLifestyleStockForType } from "@/lib/media/platform-stock";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
import { buildImageResolver, type CandidateImage } from "./image-resolver";
import { getLook, LOOKS } from "./looks";
import { composePagelessHome } from "./pageless-home";
import { resolveTenantBusinessType } from "./tenant-business-type";
import type { SiteLocale } from "./types";

export async function resolveLookFallbackHomeTree(
  supabase: SupabaseClient,
  input: { tenantId: string; businessName: string | null; tagline?: string | null; city?: string | null; locale?: SiteLocale },
): Promise<BuilderNodeTree | null> {
  try {
    const { data: agency, error } = await supabase.from("agencies").select("settings, display_name").eq("id", input.tenantId).maybeSingle<{ settings: unknown; display_name: string | null }>();
    if (error) {
      logServerError("pageless-fallback.settings", error);
      return null;
    }
    const type = resolveTenantBusinessType(agency?.settings ?? null);
    const look = getLook(DEFAULT_LOOK_BY_FAMILY[type.family]) ?? LOOKS[0];
    const locale = input.locale ?? "es";
    const stock = await queryLifestyleStockForType(supabase, { businessType: type.typeId, family: type.family });
    const { resolve } = buildImageResolver(stock.map<CandidateImage>((s) => ({ src: s.url, width: s.width, height: s.height, alt: s.alt, role: s.role, owner: false })));
    const identity = { businessName: input.businessName?.trim() || agency?.display_name?.trim() || "", tagline: input.tagline ?? null, city: input.city ?? null };
    if (!identity.businessName) return null; // no name → the caller's own safety net
    // D-169: the type's catalogue / transaction components sit on the Look's
    // inner pages, which nothing serves for a page-less tenant; fold them
    // onto the home so a restaurant shows its menu board + reserve band and
    // a studio its class picker.
    const { tree } = composePagelessHome({
      look,
      locale,
      identity,
      images: resolve,
      typeId: type.typeId,
      ctx: { locale, family: type.family, typeId: type.typeId, identity, images: resolve, rosterActive: type.family === "agency" },
    });
    return tree;
  } catch (error) {
    logServerError("pageless-fallback", error);
    return null;
  }
}
