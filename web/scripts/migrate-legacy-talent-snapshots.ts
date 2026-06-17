/**
 * migrate-legacy-talent-snapshots.ts — one-shot, idempotent migration of
 * talent-AUTHORED legacy profile-snapshot content into the Talent Max Site model.
 *
 * BACKGROUND (repoint #493): `talent_sites.draft_snapshot` / `published_snapshot`
 * (jsonb) used to render the slot-based Max PROFILE at `/t/<code>`. That render
 * path is gone — `/t/<code>` now renders the discovery profile, and the Max
 * website renders from `talent_pages` + the shell columns. The snapshot columns
 * are deprecated (kept, never dropped). This script ensures that any talent who
 * authored real custom snapshot content gets a Max-site surface (a `site_slug`
 * + a `talent_pages` HOME page seeded with their authored title/tagline) so
 * their content is reachable, while the raw snapshot stays in the DB as the
 * lossless backup.
 *
 * NO DATA LOSS: this script only ADDS — it derives a slug when missing and
 * INSERTS a starter home page when none exists. It NEVER overwrites an existing
 * home page, an existing slug, or any snapshot column. The original snapshot
 * jsonb is left fully intact.
 *
 * "REAL CUSTOM CONTENT" (else skip): a row qualifies only when its snapshot has
 * talent-authored signal — a non-empty title / metaDescription / introTagline,
 * `compositionMode === "custom"`, or at least one non-hidden slot with props.
 * A platform-default / empty snapshot (auto-built starter, no authored edits) is
 * skipped. In the current test env this is expected to be few / zero rows.
 *
 * IDEMPOTENT — re-running only fills still-missing pieces (slug / home page) and
 * is a no-op once every qualifying talent has both. REVERSIBLE — clearing the
 * derived slug + deleting the seeded home page undoes it.
 *
 * Run from web/:
 *   tsx --env-file=.env.local scripts/migrate-legacy-talent-snapshots.ts --dry-run
 *   tsx --env-file=.env.local scripts/migrate-legacy-talent-snapshots.ts
 *
 * ENV REQUIRED:
 *   NEXT_PUBLIC_SUPABASE_URL   — target Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (bypasses RLS; trusted boundary)
 *
 * NOTE: the migrations `20261001000000_talent_sites.sql` +
 * `20261030000000_talent_max_site.sql` MUST be applied first (this needs the
 * snapshot columns, `site_slug`, and the `talent_pages` table).
 */
import { createClient } from "@supabase/supabase-js";
import { deriveSiteSlug } from "../src/lib/talent-site/server/derive-site-slug";
import { buildStarterHomePageTree } from "../src/lib/talent-site/default-max-site-trees";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svcKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
  );
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const STARTER_HOME_SLUG = "home";

type SnapshotLike = {
  compositionMode?: unknown;
  fields?: {
    title?: unknown;
    metaDescription?: unknown;
    introTagline?: unknown;
  } | null;
  slots?: Array<{ props?: unknown; hidden?: unknown } | null> | null;
} | null;

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Does this snapshot carry talent-AUTHORED content worth migrating? Conservative
 * by design — a false "no" only means we skip seeding a page (the snapshot still
 * survives in the DB), never data loss.
 */
function hasAuthoredContent(snap: SnapshotLike): boolean {
  if (!snap || typeof snap !== "object") return false;
  if (asString(snap.compositionMode) === "custom") return true;
  const f = snap.fields ?? null;
  if (f && (asString(f.title) || asString(f.metaDescription) || asString(f.introTagline))) {
    return true;
  }
  const slots = Array.isArray(snap.slots) ? snap.slots : [];
  return slots.some(
    (s) =>
      s != null &&
      typeof s === "object" &&
      s.hidden !== true &&
      s.props != null &&
      typeof s.props === "object" &&
      Object.keys(s.props as Record<string, unknown>).length > 0,
  );
}

/** Best authored title/tagline to seed the starter home with (may be ""). */
function authoredHeadline(snap: SnapshotLike): { title: string; tagline: string } {
  const f = snap?.fields ?? null;
  return {
    title: asString(f?.title),
    tagline: asString(f?.introTagline),
  };
}

async function main(): Promise<void> {
  const supabase = createClient(url!, svcKey!, {
    auth: { persistSession: false },
  });

  // Slugs already taken → de-dupe seed (grows as we assign new ones).
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

  // Candidate rows — any snapshot present (published or draft). Join the talent
  // for slug derivation + the page title fallback.
  const { data: rows, error: rowsErr } = await supabase
    .from("talent_sites")
    .select(
      "id, talent_profile_id, site_slug, draft_snapshot, published_snapshot, talent_profiles!inner(display_name, profile_code)",
    )
    .or("draft_snapshot.not.is.null,published_snapshot.not.is.null");
  if (rowsErr) {
    console.error("Failed to load talent_sites rows:", rowsErr.message);
    process.exit(1);
  }

  type Row = {
    id: string;
    talent_profile_id: string;
    site_slug: string | null;
    draft_snapshot: SnapshotLike;
    published_snapshot: SnapshotLike;
    talent_profiles: { display_name: string | null; profile_code: string | null } | null;
  };
  const candidates = (rows ?? []) as unknown as Row[];

  // Keep only rows with real authored content (published preferred, else draft).
  const authored = candidates.filter(
    (r) => hasAuthoredContent(r.published_snapshot) || hasAuthoredContent(r.draft_snapshot),
  );

  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}${candidates.length} talent_sites row(s) with a snapshot; ` +
      `${authored.length} carry authored content to migrate.`,
  );

  let slugsAssigned = 0;
  let pagesSeeded = 0;

  for (const r of authored) {
    const displayName =
      r.talent_profiles?.display_name?.trim() ||
      r.talent_profiles?.profile_code?.trim() ||
      "Site";

    // 1. Ensure a site_slug (idempotent — only when missing).
    let slug = r.site_slug;
    if (!slug) {
      slug = deriveSiteSlug(
        r.talent_profiles?.display_name,
        r.talent_profiles?.profile_code,
        taken,
      );
      taken.add(slug.toLowerCase());
      console.log(`  ${r.id} → site_slug=${slug}`);
      if (!DRY_RUN) {
        const { error: slugErr } = await supabase
          .from("talent_sites")
          .update({ site_slug: slug })
          .eq("id", r.id)
          .is("site_slug", null);
        if (slugErr) {
          console.error(`    ! slug failed (${slug}): ${slugErr.message}`);
          taken.delete(slug.toLowerCase());
          continue;
        }
      }
      slugsAssigned += 1;
    }

    // 2. Ensure a HOME page (idempotent — never overwrite an existing one).
    const { data: homeRow, error: homeErr } = await supabase
      .from("talent_pages")
      .select("id")
      .eq("talent_profile_id", r.talent_profile_id)
      .eq("is_home", true)
      .maybeSingle();
    if (homeErr) {
      console.error(`    ! home lookup failed for ${r.talent_profile_id}: ${homeErr.message}`);
      continue;
    }
    if (homeRow) continue; // already has a Max-site home — leave it untouched.

    // Promote an existing `home`-slug page (a legacy single-page builder may own
    // it without the is_home flag) rather than colliding on the unique index.
    const { data: slugPage } = await supabase
      .from("talent_pages")
      .select("id")
      .eq("talent_profile_id", r.talent_profile_id)
      .eq("slug", STARTER_HOME_SLUG)
      .maybeSingle();

    const preferred =
      hasAuthoredContent(r.published_snapshot) ? r.published_snapshot : r.draft_snapshot;
    const headline = authoredHeadline(preferred);
    const title = headline.title || displayName;

    if (slugPage) {
      console.log(`  ${r.id} → promote existing "home" page to is_home`);
      if (!DRY_RUN) {
        const { error: promoteErr } = await supabase
          .from("talent_pages")
          .update({ is_home: true, nav_label: "Home" })
          .eq("id", (slugPage as { id: string }).id);
        if (promoteErr) {
          console.error(`    ! promote failed: ${promoteErr.message}`);
          continue;
        }
      }
      pagesSeeded += 1;
      continue;
    }

    console.log(`  ${r.id} → seed talent_pages home (title="${title}")`);
    if (!DRY_RUN) {
      const starterTree = buildStarterHomePageTree({
        displayName: title,
        tagline: headline.tagline || null,
      });
      const { error: pageErr } = await supabase.from("talent_pages").insert({
        talent_profile_id: r.talent_profile_id,
        slug: STARTER_HOME_SLUG,
        title,
        status: "draft",
        blocks: starterTree,
        theme: {},
        is_home: true,
        sort_order: 0,
        nav_label: "Home",
        required_talent_tier: "talent_portfolio",
      });
      if (pageErr) {
        console.error(`    ! home insert failed: ${pageErr.message}`);
        continue;
      }
    }
    pagesSeeded += 1;
  }

  console.log(
    `${DRY_RUN ? "[dry-run] would assign" : "assigned"} ${slugsAssigned} slug(s); ` +
      `${DRY_RUN ? "would seed" : "seeded"} ${pagesSeeded} home page(s). ` +
      "Raw snapshots left intact.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
