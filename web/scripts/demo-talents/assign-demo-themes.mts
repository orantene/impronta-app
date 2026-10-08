/**
 * TUL-403: assign every seeded DEMO talent whose draft site has NO theme
 * (`talent_sites.theme_design_slug IS NULL`) to its WORKBOOK theme, so it shows
 * up in the theme gallery. Pure guards and planner: assign-demo-themes.ts. The
 * talent-to-theme mapping is the committed demo-theme-map.json (derived from the
 * owner's Demo-Foundation workbook, "Primary theme" column).
 *
 * FINISHED themes only (maison-v2, folio, gridline). A demo whose workbook theme
 * is not finished is listed as "queued until theme finished" and is not touched.
 *
 * Apply path = the demo pipeline's own design step (`loadDemoRows`,
 * `planDemoDesign`, `writeDemoDraft`, the same one `demos:rebuild` runs): the
 * design is applied through `applyDesign` (atomic draft write, slug + version pin,
 * stamps, history) with a gallery palette. DRAFT ONLY: nothing is published, no
 * content is touched. `assertDemoTarget` needs the demo to be in the 27-demo
 * registry, which these are not, so the same three checks are made here per row
 * (`is_demo = true`, demo email + demo_batch, slug equals the map) and the row is
 * refused when one fails. Never TAL-93938 / book-jorgelina / TAL-93900.
 *
 * DRY RUN by default (reads only). Writing needs BOTH --apply and --yes. Before
 * the first write every touched row goes to a JSON backup under
 * scripts/demo-talents/backups/ (gitignored); --restore <file> puts it back.
 * Idempotent: a site that already has a theme is never touched.
 *
 * Run (from web/), by the Project Manager:
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/demo-talents/assign-demo-themes.mts                            # dry run
 *   ... assign-demo-themes.mts --apply --yes [--only TAL-93103,TAL-93104]
 *   ... assign-demo-themes.mts --restore scripts/demo-talents/backups/<file>.json [--yes] [--force-restore]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FINISHED_DESIGN_SLUGS,
  formatPlan,
  formatRestore,
  parseArgs,
  planAssignments,
  planRestore,
  RefusedError,
  restorePatch,
  validateMap,
  type BackupFile,
  type BackupRow,
  type SiteFacts,
  type ThemeMapFile,
} from "./assign-demo-themes";

const { isDemoAccount } = await import("../../src/lib/talent-site/theme-catalog/demo-account");
const { loadDemoRows, planDemoDesign, writeDemoDraft } = await import("../../src/lib/talent-site/demos/design-step.server");
const { findDemo } = await import("../../src/lib/talent-site/demos/registry");
const { loadDemoContentFixture } = await import("../../src/lib/talent-site/demos/content-fixture");
const { loadDemoDesignRow } = await import("../../src/lib/talent-site/theme-releases/release-design.server");
const { getGalleryDesign } = await import("../../src/lib/talent-site/theme-catalog/gallery-meta");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(HERE, "backups");
const MAP_FILE = path.join(HERE, "demo-theme-map.json");
const SITE_COLS =
  "shell_tree, theme_design_slug, theme_design_version, theme_token_origin, design_tokens_draft, theme_look_slug, custom_palette, theme_demo_slug, menu_style, pending_design, accepting_bookings, accepting_inquiries, chat_enabled, chat_config, draft_rev, draft_updated_at, updated_at, updated_by";

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

function loadMap(): ThemeMapFile {
  const map = JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) as ThemeMapFile;
  validateMap(map);
  return map;
}

function hasFixture(code: string): boolean {
  try {
    loadDemoContentFixture(code);
    return true;
  } catch {
    return false;
  }
}

/** Demo profiles (is_demo = true) plus every mapped code; the planner re-checks each row. */
async function loadFacts(map: ThemeMapFile): Promise<SiteFacts[]> {
  const codes = map.entries.map((e) => e.profileCode);
  const selectCols = "id, profile_code, display_name, user_id, is_demo";
  type P = { id: string; profile_code: string; display_name: string | null; user_id: string | null; is_demo: boolean | null };
  const mapped: P[] = [];
  for (let i = 0; i < codes.length; i += 100) {
    mapped.push(
      ...(must(
        await admin.from("talent_profiles").select(selectCols).in("profile_code", codes.slice(i, i + 100)).is("deleted_at", null).neq("profile_code", "TAL-93938"),
        "mapped profiles read",
      ) as P[]),
    );
  }
  const demos = must(
    await admin.from("talent_profiles").select(selectCols).eq("is_demo", true).is("deleted_at", null).neq("profile_code", "TAL-93938").limit(5000),
    "demo profiles read",
  ) as P[];
  const profiles = [...new Map([...mapped, ...demos].map((p) => [p.id, p])).values()];
  const ids = profiles.map((p) => p.id);
  const sites: Array<{ id: string; site_slug: string | null; talent_profile_id: string; theme_design_slug: string | null }> = [];
  const pages: Array<{ talent_profile_id: string; is_home: boolean | null }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    sites.push(...(must(await admin.from("talent_sites").select("id, site_slug, talent_profile_id, theme_design_slug").in("talent_profile_id", chunk), "sites read") as typeof sites));
    pages.push(...(must(await admin.from("talent_pages").select("talent_profile_id, is_home").in("talent_profile_id", chunk).eq("is_home", true), "pages read") as typeof pages));
  }
  const siteBy = new Map(sites.map((s) => [s.talent_profile_id, s]));
  const hasHome = new Set(pages.map((p) => p.talent_profile_id));
  const out: SiteFacts[] = [];
  for (const p of profiles) {
    const s = siteBy.get(p.id);
    if (!s || !p.user_id) continue; // no site or no account: nothing to assign
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(p.user_id);
    if (uErr) throw new Error(`account read failed for ${p.profile_code}: ${uErr.message}`);
    out.push({
      siteId: s.id,
      siteSlug: s.site_slug,
      profileId: p.id,
      profileCode: p.profile_code,
      displayName: p.display_name,
      themeDesignSlug: s.theme_design_slug,
      isDemo: p.is_demo,
      email: u.user?.email ?? null,
      demoBatch: u.user?.app_metadata?.demo_batch,
      hasHomePage: hasHome.has(p.id),
    });
  }
  return out;
}

async function readBackupRow(f: SiteFacts): Promise<BackupRow> {
  const site = must(await admin.from("talent_sites").select(SITE_COLS).eq("id", f.siteId).maybeSingle(), "site backup read") as unknown as Record<string, unknown> | null;
  const home = must(
    await admin.from("talent_pages").select("id, blocks").eq("talent_profile_id", f.profileId).eq("is_home", true).maybeSingle(),
    "home backup read",
  ) as unknown as { id: string; blocks: unknown } | null;
  if (!site) throw new Error(`site ${f.siteId} vanished before backup`);
  return { profileCode: f.profileCode, profileId: f.profileId, siteId: f.siteId, siteSlug: f.siteSlug, site, homePage: home ? { id: home.id, blocks: home.blocks } : null };
}

function writeBackup(file: BackupFile, existing?: string): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = existing ?? path.join(BACKUP_DIR, `tul-403-demo-themes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(target, JSON.stringify(file, null, 2));
  return target;
}

async function runAssign(opts: ReturnType<typeof parseArgs>): Promise<number> {
  const map = loadMap();
  const released = new Set<string>();
  for (const slug of FINISHED_DESIGN_SLUGS) {
    if (await loadDemoDesignRow(admin, slug)) released.add(slug);
  }
  const decisions = planAssignments(await loadFacts(map), {
    map,
    only: opts.only,
    releasedDesigns: released,
    palettesFor: (slug) => getGalleryDesign(slug)?.palettes.map((p) => p.key) ?? [],
    registryPaletteFor: (code) => findDemo(code)?.palette ?? null,
    hasContentFixture: hasFixture,
  });
  console.log(formatPlan(decisions, { mode: opts.apply ? "apply" : "dry-run" }));
  const assign = decisions.flatMap((d) => (d.action === "assign" ? [d] : []));
  if (!opts.apply) {
    console.log("\nDry run: nothing written. Re-run with --apply --yes to write drafts.");
    return 0;
  }
  if (assign.length === 0) {
    console.log("\nNothing to do (idempotent no-op).");
    return 0;
  }
  const rows: BackupRow[] = [];
  for (const d of assign) rows.push(await readBackupRow(d.facts));
  const backup: BackupFile = { version: 1, createdAt: new Date().toISOString(), rows };
  const file = writeBackup(backup);
  console.log(`\nBackup of ${rows.length} row(s): ${file}`);
  let failed = 0;
  for (const d of assign) {
    const f = d.facts;
    const row = rows.find((r) => r.siteId === f.siteId)!;
    console.log(`writing ${f.profileCode} id=${f.profileId} site=${f.siteSlug ?? "(no slug)"} -> ${d.designSlug} (${d.palette})`);
    try {
      const demoRows = await loadDemoRows(admin, f.profileCode);
      // Re-check on the freshly read rows, right before the write.
      if (demoRows.tp.id !== f.profileId || demoRows.site.id !== f.siteId) throw new Error("rows differ from the plan; skipped");
      if (!isDemoAccount(demoRows.email, demoRows.demoBatch)) throw new Error("not a demo account; refused");
      if (demoRows.site.theme_design_slug) throw new Error("site got a theme since the plan; left alone");
      const reg = findDemo(f.profileCode);
      const spec = {
        design: d.designSlug as "maison-v2" | "folio" | "gridline",
        palette: d.palette,
        profileCode: f.profileCode,
        live: false,
        ...(reg?.keepLook ? { keepLook: true } : {}),
        ...(d.designSlug === "gridline" ? { contentFixture: f.profileCode } : reg?.contentFixture ? { contentFixture: reg.contentFixture } : {}),
      };
      const plan = await planDemoDesign(admin, spec, demoRows);
      await writeDemoDraft(admin, spec, demoRows, plan);
      const after = must(await admin.from("talent_sites").select("draft_rev, theme_design_slug, theme_design_version").eq("id", f.siteId).maybeSingle(), "read-back") as unknown as { draft_rev: number | null; theme_design_slug: string | null; theme_design_version: number | null } | null;
      if (after?.theme_design_slug !== d.designSlug) throw new Error(`read-back mismatch: theme_design_slug=${after?.theme_design_slug}`);
      row.after = { draftRev: after.draft_rev ?? null, designSlug: d.designSlug, designVersion: after.theme_design_version ?? null };
      writeBackup(backup, file);
      console.log("  ok (draft only, needs publish)");
    } catch (err) {
      failed++;
      console.error(`  FAILED ${f.profileCode}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nDone: ${assign.length - failed} applied, ${failed} failed. Backup: ${file}`);
  return failed > 0 ? 1 : 0;
}

async function runRestore(opts: ReturnType<typeof parseArgs>): Promise<number> {
  const backup = JSON.parse(fs.readFileSync(opts.restore!, "utf8")) as BackupFile;
  if (backup.version !== 1 || !Array.isArray(backup.rows)) throw new RefusedError("not a demo-theme backup file");
  const ids = backup.rows.map((r) => r.siteId);
  const sites = must(await admin.from("talent_sites").select("id, draft_rev, talent_profile_id").in("id", ids), "restore read") as Array<{ id: string; draft_rev: number | null; talent_profile_id: string }>;
  const profs = must(await admin.from("talent_profiles").select("id, is_demo").in("id", sites.map((s) => s.talent_profile_id)), "restore profiles read") as Array<{ id: string; is_demo: boolean | null }>;
  const demoBy = new Map(profs.map((p) => [p.id, p.is_demo]));
  const current = new Map(sites.map((s) => [s.id, { draftRev: s.draft_rev, isDemo: demoBy.get(s.talent_profile_id) ?? null }]));
  const decisions = planRestore(backup, current, opts.forceRestore);
  console.log(formatRestore(decisions));
  if (!opts.yes) {
    console.log("\nDry run: nothing written. Add --yes to restore.");
    return 0;
  }
  let failed = 0;
  for (const d of decisions) {
    if (d.action !== "restore") continue;
    const r = d.row;
    const { error } = await admin.from("talent_sites").update(restorePatch(r)).eq("id", r.siteId).eq("talent_profile_id", r.profileId);
    if (error) { failed++; console.error(`  FAILED site ${r.profileCode}: ${error.message}`); continue; }
    if (r.homePage) {
      const { error: pe } = await admin.from("talent_pages").update({ blocks: r.homePage.blocks }).eq("id", r.homePage.id).eq("talent_profile_id", r.profileId);
      if (pe) { failed++; console.error(`  FAILED page ${r.profileCode}: ${pe.message}`); }
    }
  }
  console.log(failed ? `\nRestore finished with ${failed} failure(s).` : "\nRestore done.");
  return failed ? 1 : 0;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  process.exit(opts.restore ? await runRestore(opts) : await runAssign(opts));
} catch (err) {
  console.error(err instanceof RefusedError ? `REFUSED: ${err.message}` : err);
  process.exit(err instanceof RefusedError ? 2 : 1);
}
