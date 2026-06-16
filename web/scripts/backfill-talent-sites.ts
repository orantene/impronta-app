/**
 * backfill-talent-sites.ts — one-shot, idempotent `talent_sites.site_slug`
 * backfill for the Talent Max Site model.
 *
 * For every existing `talent_sites` row that already has a PUBLISHED profile
 * snapshot but NO `site_slug`, derive a globally-unique slug from the talent's
 * display name (fallback profile_code) so the site is reachable at
 * /t/site/<slug>. In this test env there are likely few/zero such rows.
 *
 * SLUG DERIVATION + DEDUPE — reuses the SAME pure `deriveSiteSlug` helper the
 * provisioning path uses (`src/lib/talent-site/server/derive-site-slug`). The
 * set of "taken" slugs is seeded from every row that already has one AND grows
 * as this pass assigns new ones, so two un-slugged rows that slugify the same
 * get "-2"/"-3" suffixes. The globally-unique partial index on site_slug is the
 * hard backstop; a per-row insert that still races a duplicate is logged + skipped.
 *
 * IDEMPOTENT — only touches rows where site_slug IS NULL. Re-running is a no-op
 * once every published site has a slug. REVERSIBLE — clearing site_slug back to
 * NULL undoes it.
 *
 * Run from web/:
 *   tsx --env-file=.env.local scripts/backfill-talent-sites.ts --dry-run   # enumerate, no writes
 *   tsx --env-file=.env.local scripts/backfill-talent-sites.ts             # apply
 *
 * ENV REQUIRED:
 *   NEXT_PUBLIC_SUPABASE_URL   — target Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (bypasses RLS; trusted boundary)
 *
 * NOTE: the migration `20261030000000_talent_max_site.sql` MUST be applied
 * first (this needs the `site_slug` column + its unique index).
 */
import { createClient } from "@supabase/supabase-js";
import { deriveSiteSlug } from "../src/lib/talent-site/server/derive-site-slug";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svcKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
  );
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const supabase = createClient(url!, svcKey!, {
    auth: { persistSession: false },
  });

  // 1. Slugs already in use → the de-dupe seed.
  const { data: takenRows, error: takenErr } = await supabase
    .from("talent_sites")
    .select("site_slug")
    .not("site_slug", "is", null);
  if (takenErr) {
    console.error("Failed to load existing slugs:", takenErr.message);
    process.exit(1);
  }
  const taken = new Set<string>(
    (takenRows ?? [])
      .map((r) => (r as { site_slug: string | null }).site_slug?.toLowerCase())
      .filter((s): s is string => !!s),
  );

  // 2. Candidates — published profile snapshot, no slug yet. Join the talent's
  //    display_name + profile_code for derivation.
  const { data: candRows, error: candErr } = await supabase
    .from("talent_sites")
    .select("id, talent_profile_id, talent_profiles!inner(display_name, profile_code)")
    .is("site_slug", null)
    .not("published_snapshot", "is", null);
  if (candErr) {
    console.error("Failed to load candidates:", candErr.message);
    process.exit(1);
  }

  type Cand = {
    id: string;
    talent_profile_id: string;
    talent_profiles: { display_name: string | null; profile_code: string | null } | null;
  };
  const candidates = (candRows ?? []) as unknown as Cand[];

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}${candidates.length} talent_sites row(s) need a site_slug.`,
  );

  let applied = 0;
  for (const c of candidates) {
    const slug = deriveSiteSlug(
      c.talent_profiles?.display_name,
      c.talent_profiles?.profile_code,
      taken,
    );
    taken.add(slug); // reserve so the next candidate dedupes against it

    console.log(`  ${c.id} → ${slug}`);
    if (DRY_RUN) continue;

    const { error: updErr } = await supabase
      .from("talent_sites")
      .update({ site_slug: slug })
      .eq("id", c.id);
    if (updErr) {
      // A concurrent unique-violation just means someone else claimed it —
      // log and skip; a re-run will pick a fresh suffix.
      console.error(`    ! failed (${slug}): ${updErr.message}`);
      taken.delete(slug);
      continue;
    }
    applied += 1;
  }

  console.log(
    `${DRY_RUN ? "[dry-run] would assign" : "assigned"} ${DRY_RUN ? candidates.length : applied} slug(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
