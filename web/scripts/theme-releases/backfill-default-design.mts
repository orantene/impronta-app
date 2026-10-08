/**
 * TUL-376: backfill a DEFAULT DESIGN for existing talent sites whose
 * `talent_sites.theme_design_slug` is NULL (the sites that hit "Apply a design
 * before publishing", TUL-89). Pure guards and planner: backfill-default-design.ts.
 *
 * Default design = what onboarding applies to every new talent site
 * (`ONBOARDING_DESIGN_SLUG` "maison-v2", palette `ONBOARDING_DEFAULT_PALETTE`),
 * at the newest optin/default release (`loadApplyDesignRow`, the same loader a
 * talent's "Use this design" uses).
 *
 * It applies the design through the app's own `applyDesign` (the atomic
 * `writeSiteDraft` RPC: shell + home draft, slug + version pin, token origin,
 * history entry), then the default palette the way `applyMaisonDesignAction`
 * does. DRAFT ONLY: nothing is published, no cache is busted. The touched sites
 * are reported as "needs publish".
 *
 * DRY RUN by default (reads only). Writing needs BOTH --apply and --yes. Before
 * the first write every touched row goes to a JSON backup under
 * scripts/theme-releases/backups/ (gitignored); --restore <file> puts it back.
 * Never TAL-93938 / book-jorgelina (the site query excludes her slug, the
 * planner refuses her code and slug again).
 *
 * Run (from web/), by the Project Manager:
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/theme-releases/backfill-default-design.mts                      # dry run
 *   ... backfill-default-design.mts --apply --yes [--only TAL-90001,TAL-90002] [--include-test]
 *   ... backfill-default-design.mts --restore scripts/theme-releases/backups/<file>.json [--yes] [--force-restore]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatPlan,
  parseArgs,
  planBackfill,
  planRestore,
  RefusedError,
  type BackupFile,
  type BackupRow,
  type SiteCandidate,
} from "./backfill-default-design";

const { applyDesign, coerceTokenMap } = await import("../../src/lib/talent-site/server/theme-apply-core");
const { loadApplyDesignRow } = await import("../../src/lib/talent-site/theme-releases/release-design.server");
const { ONBOARDING_DESIGN_SLUG, onboardingDesignApplyInput } = await import("../../src/lib/onboarding/design-apply-input");
const { MAISON_BUILTIN_DEMO } = await import("../../src/lib/talent-site/theme-catalog/maison/builtins");
const { mergeLookIntoTokens } = await import("../../src/lib/talent-site/theme-catalog/look-layer");
const { buildMaisonCustomPalette, maisonCustomLookTokens } = await import(
  "../../src/lib/talent-site/theme-catalog/maison/maison-custom-palette"
);
const { designTypographyTokens, galleryPaletteLookTokens, getGalleryDesign } = await import(
  "../../src/lib/talent-site/theme-catalog/gallery-meta"
);

const BACKUP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "backups");
const SITE_COLS =
  "shell_tree, theme_design_slug, theme_design_version, theme_token_origin, design_tokens_draft, theme_look_slug, custom_palette, theme_demo_slug, menu_style, draft_rev, draft_updated_at, updated_at, updated_by";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!url || !key) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
  process.exit(2);
}
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  console.error(`REFUSED: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
  process.exit(2);
}
const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return (res.data ?? ([] as unknown as T)) as T;
}

async function loadCandidates(): Promise<SiteCandidate[]> {
  // Her site is excluded in the query itself, so her row is never read.
  const sites = must(
    await admin
      .from("talent_sites")
      .select("id, site_slug, talent_profile_id, site_published_at, theme_design_slug")
      .is("theme_design_slug", null)
      .or("site_slug.is.null,site_slug.neq.book-jorgelina")
      .limit(5000),
    "sites read",
  ) as Array<{ id: string; site_slug: string | null; talent_profile_id: string; site_published_at: string | null; theme_design_slug: string | null }>;
  if (sites.length === 0) return [];
  const ids = sites.map((s) => s.talent_profile_id);
  const profiles = must(
    await admin.from("talent_profiles").select("id, profile_code, display_name, is_demo, is_test_account").in("id", ids).neq("profile_code", "TAL-93938"),
    "profiles read",
  ) as Array<{ id: string; profile_code: string; display_name: string | null; is_demo: boolean | null; is_test_account: boolean | null }>;
  const byProfile = new Map(profiles.map((p) => [p.id, p]));
  const siteIds = sites.map((s) => s.id);
  const pages = must(
    await admin.from("talent_pages").select("talent_profile_id, status, blocks_published").in("talent_profile_id", ids).limit(20000),
    "pages read",
  ) as Array<{ talent_profile_id: string; status: string | null; blocks_published: unknown }>;
  const livePages = new Set(
    pages
      .filter((p) => p.status === "published" || (Array.isArray(p.blocks_published) && p.blocks_published.length > 0))
      .map((p) => p.talent_profile_id),
  );
  const edits = must(
    await admin.from("talent_site_history").select("site_id").eq("kind", "edit").in("site_id", siteIds).limit(20000),
    "history read",
  ) as Array<{ site_id: string }>;
  const edited = new Set(edits.map((e) => e.site_id));
  const out: SiteCandidate[] = [];
  for (const s of sites) {
    const p = byProfile.get(s.talent_profile_id);
    if (!p) continue; // profile not readable (or it is the forbidden one): never a candidate
    out.push({
      siteId: s.id,
      siteSlug: s.site_slug,
      profileId: p.id,
      profileCode: p.profile_code,
      displayName: p.display_name,
      themeDesignSlug: s.theme_design_slug,
      sitePublishedAt: s.site_published_at,
      hasLivePages: livePages.has(p.id),
      hasTalentEdits: edited.has(s.id),
      isDemo: p.is_demo,
      isTestAccount: p.is_test_account,
    });
  }
  return out;
}

async function readBackupRow(c: SiteCandidate): Promise<BackupRow> {
  const site = must(await admin.from("talent_sites").select(SITE_COLS).eq("id", c.siteId).maybeSingle(), "site backup read") as unknown as Record<string, unknown> | null;
  const home = must(
    await admin.from("talent_pages").select("id, blocks").eq("talent_profile_id", c.profileId).eq("is_home", true).maybeSingle(),
    "home backup read",
  ) as unknown as { id: string; blocks: unknown } | null;
  if (!site) throw new Error(`site ${c.siteId} vanished before backup`);
  return { profileCode: c.profileCode, profileId: c.profileId, siteId: c.siteId, siteSlug: c.siteSlug, site, homePage: home ? { id: home.id, blocks: home.blocks } : null };
}

function writeBackup(file: BackupFile, existing?: string): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = existing ?? path.join(BACKUP_DIR, `tul-376-default-design-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(target, JSON.stringify(file, null, 2));
  return target;
}

/** Mirrors applyMaisonDesignAction's gallery-palette branch (draft tokens + custom_palette + demo/menu meta). */
async function applyDefaultPalette(siteId: string, designSlug: string): Promise<{ ok: boolean; error?: string }> {
  const input = onboardingDesignApplyInput(null);
  const gp = getGalleryDesign(designSlug)?.palettes.find((p) => p.key === input.galleryPaletteKey);
  if (!gp) return { ok: false, error: `palette ${input.galleryPaletteKey} not found on ${designSlug}` };
  const custom = buildMaisonCustomPalette({ page: gp.page, text: gp.text, accent: gp.accent, section: gp.section }, gp.name);
  const row = must(await admin.from("talent_sites").select("design_tokens_draft").eq("id", siteId).maybeSingle(), "tokens read") as unknown as { design_tokens_draft?: unknown } | null;
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

async function runBackfill(opts: ReturnType<typeof parseArgs>): Promise<number> {
  const design = await loadApplyDesignRow(admin, ONBOARDING_DESIGN_SLUG);
  if (!design) {
    console.error(`REFUSED: default design "${ONBOARDING_DESIGN_SLUG}" did not resolve from the catalog.`);
    return 1;
  }
  const entries = planBackfill(await loadCandidates(), opts);
  console.log(formatPlan(entries, { designSlug: `${design.slug}@v${design.version}`, mode: opts.apply ? "apply" : "dry-run" }));
  const touch = entries.filter((e) => e.action === "touch").map((e) => e.candidate);
  if (!opts.apply) {
    console.log("\nDry run: nothing written. Re-run with --apply --yes to write drafts.");
    return 0;
  }
  if (touch.length === 0) {
    console.log("\nNothing to do (idempotent no-op).");
    return 0;
  }
  const rows: BackupRow[] = [];
  for (const c of touch) rows.push(await readBackupRow(c));
  const backup: BackupFile = { version: 1, createdAt: new Date().toISOString(), designSlug: design.slug, rows };
  const file = writeBackup(backup);
  console.log(`\nBackup of ${rows.length} row(s): ${file}`);
  let failed = 0;
  for (const c of touch) {
    const row = rows.find((r) => r.siteId === c.siteId)!;
    console.log(`writing ${c.profileCode} id=${c.profileId} site=${c.siteSlug ?? "(no slug)"}`);
    const res = await applyDesign(admin, { talentProfileId: c.profileId, siteId: c.siteId, design, displayName: c.displayName ?? c.profileCode, actor: "tulala" });
    if (!res.ok) {
      failed++;
      console.error(`  FAILED ${c.profileCode}: ${res.code} ${res.error}`);
      continue;
    }
    const pal = await applyDefaultPalette(c.siteId, design.slug);
    if (!pal.ok) console.error(`  design applied, palette FAILED for ${c.profileCode}: ${pal.error}`);
    const after = must(await admin.from("talent_sites").select("draft_rev, theme_design_slug").eq("id", c.siteId).maybeSingle(), "read-back") as unknown as { draft_rev: number | null; theme_design_slug: string | null } | null;
    if (after?.theme_design_slug !== design.slug) {
      failed++;
      console.error(`  READ-BACK MISMATCH ${c.profileCode}: theme_design_slug=${after?.theme_design_slug}`);
      continue;
    }
    row.after = { draftRev: after.draft_rev ?? null, designSlug: design.slug, designVersion: design.version };
    writeBackup(backup, file);
    console.log("  ok (draft only, needs publish)");
  }
  console.log(`\nDone: ${touch.length - failed} applied, ${failed} failed. Backup: ${file}`);
  return failed > 0 ? 1 : 0;
}

async function runRestore(opts: ReturnType<typeof parseArgs>): Promise<number> {
  const backup = JSON.parse(fs.readFileSync(opts.restore!, "utf8")) as BackupFile;
  if (backup.version !== 1 || !Array.isArray(backup.rows)) throw new RefusedError("not a backfill backup file");
  const ids = backup.rows.map((r) => r.siteId);
  const cur = must(await admin.from("talent_sites").select("id, draft_rev").in("id", ids), "restore read") as Array<{ id: string; draft_rev: number | null }>;
  const decisions = planRestore(backup, new Map(cur.map((c) => [c.id, c.draft_rev])), opts.forceRestore);
  for (const d of decisions) {
    console.log(`${d.action === "restore" ? "RESTORE" : "SKIP   "} ${d.row.profileCode} id=${d.row.profileId} site=${d.row.siteSlug ?? "(no slug)"}${d.action === "skip" ? `  (${d.reason})` : ""}`);
  }
  if (!opts.yes) {
    console.log("\nDry run: nothing written. Add --yes to restore.");
    return 0;
  }
  let failed = 0;
  for (const d of decisions) {
    if (d.action !== "restore") continue;
    const r = d.row;
    const { error } = await admin.from("talent_sites").update(r.site).eq("id", r.siteId);
    if (error) { failed++; console.error(`  FAILED site ${r.profileCode}: ${error.message}`); continue; }
    if (r.homePage) {
      const { error: pe } = await admin.from("talent_pages").update({ blocks: r.homePage.blocks }).eq("id", r.homePage.id);
      if (pe) { failed++; console.error(`  FAILED page ${r.profileCode}: ${pe.message}`); }
    }
  }
  console.log(failed ? `\nRestore finished with ${failed} failure(s).` : "\nRestore done.");
  return failed ? 1 : 0;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  process.exit(opts.restore ? await runRestore(opts) : await runBackfill(opts));
} catch (err) {
  console.error(err instanceof RefusedError ? `REFUSED: ${err.message}` : err);
  process.exit(err instanceof RefusedError ? 2 : 1);
}
