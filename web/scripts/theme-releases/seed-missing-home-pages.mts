/**
 * TUL-402: seed a starter HOME page for old talent sites that have a
 * `talent_sites` row but no `is_home` page (signup never created the home),
 * then apply the onboarding default design (maison-v2 / rose) as a DRAFT.
 *
 * Pure guards and planner: seed-missing-home-pages.ts.
 *
 * Default allow-list = the nine codes on the card (TAL-92001 … TAL-92156).
 * Sites with site_published_at or a live page body are listed as
 * "possibly abandoned" and left alone — PM decides. Never TAL-93938.
 *
 * DRY RUN by default (reads only). Writing needs BOTH --apply and --yes.
 * Before the first write every touched row goes to a JSON backup under
 * scripts/theme-releases/backups/ (gitignored).
 *
 * Run (from web/), by the Project Manager — agents must NOT run --apply:
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/theme-releases/seed-missing-home-pages.mts
 *   ... seed-missing-home-pages.mts --apply --yes [--only TAL-92001] [--include-test] [--skip-design]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_TARGET_CODES,
  formatPlan,
  parseArgs,
  planSeed,
  RefusedError,
  type BackupFile,
  type BackupRow,
  type SiteCandidate,
} from "./seed-missing-home-pages";

const { buildStarterHomePageTree } = await import("../../src/lib/talent-site/default-max-site-trees");
const { applyDesign, coerceTokenMap } = await import("../../src/lib/talent-site/server/theme-apply-core");
const { loadApplyDesignRow } = await import("../../src/lib/talent-site/theme-releases/release-design.server");
const { ONBOARDING_DESIGN_SLUG, onboardingDesignApplyInput } = await import(
  "../../src/lib/onboarding/design-apply-input"
);
const { MAISON_BUILTIN_DEMO } = await import("../../src/lib/talent-site/theme-catalog/maison/builtins");
const { mergeLookIntoTokens } = await import("../../src/lib/talent-site/theme-catalog/look-layer");
const { buildMaisonCustomPalette, maisonCustomLookTokens } = await import(
  "../../src/lib/talent-site/theme-catalog/maison/maison-custom-palette"
);
const { designTypographyTokens, galleryPaletteLookTokens, getGalleryDesign } = await import(
  "../../src/lib/talent-site/theme-catalog/gallery-meta"
);

const BACKUP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
const STARTER_HOME_SLUG = "home";
const SITE_COLS =
  "shell_tree, theme_design_slug, theme_design_version, theme_token_origin, design_tokens_draft, theme_look_slug, custom_palette, theme_demo_slug, menu_style, draft_rev, draft_updated_at, updated_at, updated_by";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!url || !key) {
  console.error(
    "REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).",
  );
  process.exit(2);
}
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  console.error(`REFUSED: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
  process.exit(2);
}
const admin: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return (res.data ?? ([] as unknown as T)) as T;
}

async function loadCandidates(codes: readonly string[]): Promise<SiteCandidate[]> {
  const wanted = codes.map((c) => c.toUpperCase());
  const profiles = must(
    await admin
      .from("talent_profiles")
      .select("id, profile_code, display_name, is_demo, is_test_account")
      .in("profile_code", wanted)
      .neq("profile_code", "TAL-93938"),
    "profiles read",
  ) as Array<{
    id: string;
    profile_code: string;
    display_name: string | null;
    is_demo: boolean | null;
    is_test_account: boolean | null;
  }>;
  const byCode = new Map(profiles.map((p) => [p.profile_code.toUpperCase(), p]));
  const ids = profiles.map((p) => p.id);
  const sites =
    ids.length === 0
      ? []
      : (must(
          await admin
            .from("talent_sites")
            .select("id, site_slug, talent_profile_id, site_published_at, theme_design_slug")
            .in("talent_profile_id", ids)
            .or("site_slug.is.null,site_slug.neq.book-jorgelina")
            .limit(500),
          "sites read",
        ) as Array<{
          id: string;
          site_slug: string | null;
          talent_profile_id: string;
          site_published_at: string | null;
          theme_design_slug: string | null;
        }>);
  const siteByProfile = new Map(sites.map((s) => [s.talent_profile_id, s]));
  const pages =
    ids.length === 0
      ? []
      : (must(
          await admin
            .from("talent_pages")
            .select("id, talent_profile_id, status, blocks_published, is_home, slug")
            .in("talent_profile_id", ids)
            .limit(5000),
          "pages read",
        ) as Array<{
          id: string;
          talent_profile_id: string;
          status: string | null;
          blocks_published: unknown;
          is_home: boolean | null;
          slug: string | null;
        }>);
  const pagesByProfile = new Map<string, typeof pages>();
  for (const p of pages) {
    const list = pagesByProfile.get(p.talent_profile_id) ?? [];
    list.push(p);
    pagesByProfile.set(p.talent_profile_id, list);
  }
  const siteIds = sites.map((s) => s.id);
  const edits =
    siteIds.length === 0
      ? []
      : (must(
          await admin
            .from("talent_site_history")
            .select("site_id")
            .eq("kind", "edit")
            .in("site_id", siteIds)
            .limit(5000),
          "history read",
        ) as Array<{ site_id: string }>);
  const edited = new Set(edits.map((e) => e.site_id));

  const out: SiteCandidate[] = [];
  for (const code of wanted) {
    const p = byCode.get(code);
    if (!p) {
      out.push({
        profileCode: code,
        profileId: null,
        displayName: null,
        siteId: null,
        siteSlug: null,
        themeDesignSlug: null,
        sitePublishedAt: null,
        hasHomePage: false,
        hasHomeSlugPage: false,
        homeSlugPageId: null,
        hasLivePages: false,
        hasTalentEdits: false,
        pageCount: 0,
        isDemo: null,
        isTestAccount: null,
      });
      continue;
    }
    const s = siteByProfile.get(p.id) ?? null;
    const plist = pagesByProfile.get(p.id) ?? [];
    const home = plist.find((x) => x.is_home === true) ?? null;
    const homeSlug = plist.find((x) => x.slug === STARTER_HOME_SLUG && x.is_home !== true) ?? null;
    const hasLivePages = plist.some(
      (x) =>
        x.status === "published" ||
        (Array.isArray(x.blocks_published) && x.blocks_published.length > 0),
    );
    out.push({
      profileCode: p.profile_code,
      profileId: p.id,
      displayName: p.display_name,
      siteId: s?.id ?? null,
      siteSlug: s?.site_slug ?? null,
      themeDesignSlug: s?.theme_design_slug ?? null,
      sitePublishedAt: s?.site_published_at ?? null,
      hasHomePage: home !== null,
      hasHomeSlugPage: homeSlug !== null,
      homeSlugPageId: homeSlug?.id ?? null,
      hasLivePages,
      hasTalentEdits: s ? edited.has(s.id) : false,
      pageCount: plist.length,
      isDemo: p.is_demo,
      isTestAccount: p.is_test_account,
    });
  }
  return out;
}

function writeBackup(file: BackupFile, existing?: string): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target =
    existing ??
    path.join(
      BACKUP_DIR,
      `tul-402-missing-home-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
  fs.writeFileSync(target, JSON.stringify(file, null, 2));
  return target;
}

async function seedHomePage(
  c: SiteCandidate,
): Promise<{ ok: true; homePageId: string; created: boolean; promotedFrom: string | null } | { ok: false; error: string }> {
  if (!c.profileId || !c.siteId) return { ok: false, error: "missing profile or site" };
  const title = c.displayName?.trim() || c.profileCode;
  const now = new Date().toISOString();

  if (c.homeSlugPageId) {
    const { error } = await admin
      .from("talent_pages")
      .update({ is_home: true, nav_label: "Home", updated_at: now })
      .eq("id", c.homeSlugPageId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, homePageId: c.homeSlugPageId, created: false, promotedFrom: c.homeSlugPageId };
  }

  const starterTree = buildStarterHomePageTree({ displayName: title });
  const { data, error } = await admin
    .from("talent_pages")
    .insert({
      talent_profile_id: c.profileId,
      slug: STARTER_HOME_SLUG,
      title,
      status: "draft",
      blocks: starterTree,
      theme: {},
      is_home: true,
      sort_order: 0,
      nav_label: "Home",
      required_talent_tier: "talent_portfolio",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert returned no row" };
  return { ok: true, homePageId: (data as { id: string }).id, created: true, promotedFrom: null };
}

/** Mirrors applyMaisonDesignAction's gallery-palette branch (draft tokens + custom_palette + demo/menu meta). */
async function applyDefaultPalette(siteId: string, designSlug: string): Promise<{ ok: boolean; error?: string }> {
  const input = onboardingDesignApplyInput(null);
  const gp = getGalleryDesign(designSlug)?.palettes.find((p) => p.key === input.galleryPaletteKey);
  if (!gp) return { ok: false, error: `palette ${input.galleryPaletteKey} not found on ${designSlug}` };
  const custom = buildMaisonCustomPalette(
    { page: gp.page, text: gp.text, accent: gp.accent, section: gp.section },
    gp.name,
  );
  const row = must(
    await admin.from("talent_sites").select("design_tokens_draft").eq("id", siteId).maybeSingle(),
    "tokens read",
  ) as unknown as { design_tokens_draft?: unknown } | null;
  const tokens = mergeLookIntoTokens(coerceTokenMap(row?.design_tokens_draft), {
    ...maisonCustomLookTokens(custom),
    ...(galleryPaletteLookTokens(designSlug, gp.key) ?? {}),
    ...designTypographyTokens(designSlug),
  });
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_sites")
    .update({
      design_tokens_draft: tokens,
      theme_look_slug: null,
      custom_palette: custom,
      theme_demo_slug: MAISON_BUILTIN_DEMO.slug,
      menu_style: MAISON_BUILTIN_DEMO.buildPayload().menu_style ?? "tabs",
      draft_updated_at: now,
      updated_at: now,
    })
    .eq("id", siteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function run(opts: ReturnType<typeof parseArgs>): Promise<number> {
  const scope = opts.only.length > 0 ? opts.only : DEFAULT_TARGET_CODES;
  const entries = planSeed(await loadCandidates(scope), opts);
  console.log(formatPlan(entries, { mode: opts.apply ? "apply" : "dry-run", skipDesign: opts.skipDesign }));
  const touch = entries.filter((e) => e.action === "touch").map((e) => e.candidate);
  if (!opts.apply) {
    console.log("\nDry run: nothing written. Re-run with --apply --yes to write drafts.");
    return 0;
  }
  if (touch.length === 0) {
    console.log("\nNothing to do (idempotent no-op).");
    return 0;
  }

  let design: Awaited<ReturnType<typeof loadApplyDesignRow>> = null;
  if (!opts.skipDesign) {
    design = await loadApplyDesignRow(admin, ONBOARDING_DESIGN_SLUG);
    if (!design) {
      console.error(`REFUSED: default design "${ONBOARDING_DESIGN_SLUG}" did not resolve from the catalog.`);
      return 1;
    }
  }

  const rows: BackupRow[] = [];
  const backup: BackupFile = { version: 1, createdAt: new Date().toISOString(), rows };
  const file = writeBackup(backup);
  console.log(`\nBackup file: ${file}`);

  let failed = 0;
  for (const c of touch) {
    console.log(`writing ${c.profileCode} id=${c.profileId} site=${c.siteSlug ?? "(no slug)"}`);
    const seeded = await seedHomePage(c);
    if (!seeded.ok) {
      failed++;
      console.error(`  FAILED seed home ${c.profileCode}: ${seeded.error}`);
      continue;
    }
    console.log(
      `  home ${seeded.created ? "created" : "promoted"} id=${seeded.homePageId}${seeded.promotedFrom ? ` from=${seeded.promotedFrom}` : ""}`,
    );

    let siteBefore: Record<string, unknown> | null = null;
    if (!opts.skipDesign && design) {
      siteBefore = must(
        await admin.from("talent_sites").select(SITE_COLS).eq("id", c.siteId!).maybeSingle(),
        "site backup read",
      ) as unknown as Record<string, unknown> | null;
      const res = await applyDesign(admin, {
        talentProfileId: c.profileId!,
        siteId: c.siteId!,
        design,
        displayName: c.displayName ?? c.profileCode,
        actor: "tulala",
      });
      if (!res.ok) {
        failed++;
        console.error(`  FAILED applyDesign ${c.profileCode}: ${res.code} ${res.error}`);
        rows.push({
          profileCode: c.profileCode,
          profileId: c.profileId!,
          siteId: c.siteId!,
          siteSlug: c.siteSlug,
          homeCreated: seeded.created,
          homePageId: seeded.homePageId,
          promotedFromPageId: seeded.promotedFrom,
          siteBeforeDesign: siteBefore,
        });
        writeBackup(backup, file);
        continue;
      }
      const pal = await applyDefaultPalette(c.siteId!, design.slug);
      if (!pal.ok) console.error(`  design applied, palette FAILED for ${c.profileCode}: ${pal.error}`);
      const after = must(
        await admin
          .from("talent_sites")
          .select("draft_rev, theme_design_slug, theme_design_version")
          .eq("id", c.siteId!)
          .maybeSingle(),
        "read-back",
      ) as unknown as {
        draft_rev: number | null;
        theme_design_slug: string | null;
        theme_design_version: number | null;
      } | null;
      if (after?.theme_design_slug !== design.slug) {
        failed++;
        console.error(`  READ-BACK MISMATCH ${c.profileCode}: theme_design_slug=${after?.theme_design_slug}`);
      } else {
        console.log("  ok (home + design draft; needs publish)");
      }
      rows.push({
        profileCode: c.profileCode,
        profileId: c.profileId!,
        siteId: c.siteId!,
        siteSlug: c.siteSlug,
        homeCreated: seeded.created,
        homePageId: seeded.homePageId,
        promotedFromPageId: seeded.promotedFrom,
        siteBeforeDesign: siteBefore,
        after: {
          designSlug: after?.theme_design_slug ?? null,
          designVersion: after?.theme_design_version ?? null,
          draftRev: after?.draft_rev ?? null,
        },
      });
    } else {
      console.log("  ok (home draft only; --skip-design)");
      rows.push({
        profileCode: c.profileCode,
        profileId: c.profileId!,
        siteId: c.siteId!,
        siteSlug: c.siteSlug,
        homeCreated: seeded.created,
        homePageId: seeded.homePageId,
        promotedFromPageId: seeded.promotedFrom,
        siteBeforeDesign: null,
      });
    }
    writeBackup(backup, file);
  }

  console.log(`\nDone: ${touch.length - failed} ok, ${failed} failed. Backup: ${file}`);
  console.log(
    "Restore hint: delete homeCreated pages and restore siteBeforeDesign columns from the backup JSON (PM / human).",
  );
  return failed > 0 ? 1 : 0;
}

try {
  process.exit(await run(parseArgs(process.argv.slice(2))));
} catch (err) {
  console.error(err instanceof RefusedError ? `REFUSED: ${err.message}` : err);
  process.exit(err instanceof RefusedError ? 2 : 1);
}
