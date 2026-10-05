/**
 * apply-jor-theme.ts — give Jor Beauty's site a real page, through the product.
 *
 * Run: tsx --env-file=.env.local scripts/apply-jor-theme.ts [designSlug] [lookSlug]
 *
 * WHY THIS EXISTS RATHER THAN A SEED. An earlier version wrote
 * `talent_pages.blocks` directly. That produces a page no product path created:
 * un-themed, not derived from her profile, and not the thing the builder would
 * have made. This instead calls the SAME `applyDesign` / `applyLook` the theme
 * gallery calls, so the result is exactly what a talent gets when she picks a
 * theme — and if that path is broken, this breaks too, which is the point.
 *
 * The content comes from her PROFILE via `{{token}}` hydration (displayName,
 * bio, services, gallery, contact), so the site and the directory profile
 * cannot drift into telling different stories about her.
 *
 * KNOWN LIMIT, so nobody reports it as a bug: the section kit's services block
 * renders three `{{serviceN}}` and the gallery six `{{galleryN}}`. She has 22
 * services across 4 categories and 11 images, so her SITE shows a subset while
 * her PROFILE shows the full catalogue. Closing that needs a kit block that
 * takes N categories from the catalogue.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { builtinCatalogRow } from "../src/lib/talent-site/server/builtin-catalog-row";
import { applyDesign, applyLook, publishSiteTheme } from "../src/lib/talent-site/server/theme-apply-core";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required. Run with tsx --env-file=.env.local`);
  return v;
}

const admin: SupabaseClient = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const PROFILE_CODE = "TAL-JORGBEAUTY";
const DESIGN_SLUG = process.argv[2] ?? "editorial";
const LOOK_SLUG = process.argv[3] ?? "editorial";

async function main(): Promise<void> {
  const { data: profile, error: pErr } = await admin
    .from("talent_profiles")
    .select("id, display_name, user_id")
    .eq("profile_code", PROFILE_CODE)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) throw new Error(`${PROFILE_CODE} not found`);

  const { data: site, error: sErr } = await admin
    .from("talent_sites")
    .select("id, site_slug")
    .eq("talent_profile_id", profile.id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!site) throw new Error("No talent_sites row — create the site first, through the product.");

  const design = builtinCatalogRow("design", DESIGN_SLUG);
  if (!design) throw new Error(`Unknown design "${DESIGN_SLUG}"`);
  const look = builtinCatalogRow("look", LOOK_SLUG);
  if (!look) throw new Error(`Unknown look "${LOOK_SLUG}"`);

  console.log(`Applying design="${DESIGN_SLUG}" look="${LOOK_SLUG}" to ${site.site_slug}`);

  const d = await applyDesign(admin, {
    talentProfileId: profile.id as string,
    siteId: site.id as string,
    design,
    displayName: (profile.display_name as string) ?? "Jorg Beauty",
    userId: (profile.user_id as string | null) ?? null,
  });
  console.log("  design:", d.ok ? `applied v${d.data?.designVersion}` : `FAILED — ${d.error}`);
  if (!d.ok) process.exit(1);

  const l = await applyLook(admin, {
    siteId: site.id as string,
    look,
    userId: (profile.user_id as string | null) ?? null,
  });
  console.log("  look:", l.ok ? "applied" : `FAILED — ${l.error}`);

  // Applying writes the DRAFT tokens; the public render reads the published
  // ones. Without this the colours would silently stay on the old theme.
  const p = await publishSiteTheme(admin, {
    siteId: site.id as string,
    profileCode: PROFILE_CODE,
  });
  console.log("  publish theme:", p.ok ? "published" : `FAILED — ${p.error}`);

  console.log(`\nhttps://${site.site_slug}.tulala.digital`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
