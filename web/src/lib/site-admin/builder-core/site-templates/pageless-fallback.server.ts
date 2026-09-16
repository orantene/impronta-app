/**
 * pageless-fallback.server.ts — what a tenant with NO published homepage
 * renders: its family's default Look, its type's components in their honest
 * empty state, lifestyle stock, and the owner's identity. Never blank, never a
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

import { buildComponentsForType } from "./business-components";
import { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
import { buildImageResolver, type CandidateImage } from "./image-resolver";
import { instantiateSite } from "./instantiate-site";
import { getLook, LOOKS } from "./looks";
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
    const site = instantiateSite({
      look,
      locale,
      identity,
      images: resolve,
      components: buildComponentsForType(type.typeId, { locale, family: type.family, typeId: type.typeId, identity, images: resolve, rosterActive: type.family === "agency" }),
    });
    // A validator issue means this tree must not reach a visitor; image gaps are tolerated.
    if (site.issues.some((i) => !/image slot .* unresolved/.test(i))) return null;
    return [...site.shell.header, ...site.pages.home, ...site.shell.footer];
  } catch (error) {
    logServerError("pageless-fallback", error);
    return null;
  }
}
