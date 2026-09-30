/**
 * THEME RELEASES backfill (plan §1.2, §4): stamp design origins onto talent
 * sites applied before stamps existed.
 *
 * For every talent site with a pinned Design (`theme_design_slug`):
 *   base = the Design at the site's pinned `theme_design_version`, built with
 *          the talent's own content (`buildDesignTrees(..., origin)`).
 *          The catalog stores only the CURRENT payload per Design, so a site
 *          pinned to an older version gets the current payload with a WARNING
 *          and `fp: "?"` stamps (everything reads edited, so an update only
 *          ever offers new blocks). Payload history is not in git by version.
 *   stamp = match each site node to the base by design key (slotKey, then
 *          child segment), never by node id; unmatched nodes stay talent-added.
 * Report per site (demo sites first): pinned vs catalog version, matched,
 * talent-added, base keys missing, nodes already reading edited.
 *
 * DRY RUN by default (reads only). `--yes-write` writes ONLY demo accounts
 * (profile code in THEME_DEMOS, demo_batch user, demo email), draft trees
 * only, plus the published copy when it equals the draft; a JSON backup of
 * each row is taken first. Idempotent: stamped nodes are left alone.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/theme-releases/stamp-sites.mts [--only TAL-93103] [--demos-only] [--yes-write]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

const { loadMaisonCatalogRow } = await import("../../src/lib/talent-site/server/maison-catalog-row");
const { buildDesignTrees, fallbackHydrationTokens } = await import(
  "../../src/lib/talent-site/server/theme-apply-core"
);
const { loadTemplateHydrationTokens } = await import("../../src/lib/talent-site/server/apply-template-core");
const { THEME_DEMOS } = await import("../../src/lib/talent-site/theme-catalog/theme-demos");
const { stampFromBase } = await import("../../src/lib/talent-site/theme-releases/stamp-existing");
const { classifyTree } = await import("../../src/lib/talent-site/theme-releases/classify");
const { stripDesignOrigin, stableStringify } = await import("../../src/lib/talent-site/theme-releases/origin");
const { DEMO_BATCH } = await import("../demo-talents/demos");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes("--yes-write");
const demosOnly = args.includes("--demos-only");
const only = opt("--only")?.split(",");
const backupDir = opt("--backup-dir") ?? path.join(os.homedir(), "Desktop/tulala-exports/theme-releases/backups");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DEMO_EMAIL = /^(?:[^@]+@demo\.tulala\.digital|demo-[^@]+@impronta\.test)$/;
const DEMO_CODES = new Set(THEME_DEMOS.map((d) => d.profileCode));
const asTree = (v: unknown): BuilderNode[] => (Array.isArray(v) ? (v as BuilderNode[]) : []);

type SiteRow = {
  id: string;
  talent_profile_id: string;
  theme_design_slug: string;
  theme_design_version: number | null;
  shell_tree: unknown;
  shell_published: unknown;
};

const { data: siteRows, error: siteErr } = await admin
  .from("talent_sites")
  .select("id, talent_profile_id, theme_design_slug, theme_design_version, shell_tree, shell_published")
  .not("theme_design_slug", "is", null);
if (siteErr) throw siteErr;
const sites = (siteRows ?? []) as SiteRow[];

const profileIds = sites.map((s) => s.talent_profile_id);
const { data: profiles, error: pErr } = await admin
  .from("talent_profiles")
  .select("id, profile_code, user_id, display_name")
  .in("id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);
if (pErr) throw pErr;
const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

const ordered = sites
  .map((s) => ({ site: s, profile: profileById.get(s.talent_profile_id) }))
  .filter((x) => x.profile && (!only || only.includes(x.profile.profile_code as string)))
  .filter((x) => !demosOnly || DEMO_CODES.has(x.profile!.profile_code as string))
  .sort((a, b) => {
    const da = DEMO_CODES.has(a.profile!.profile_code as string) ? 0 : 1;
    const db = DEMO_CODES.has(b.profile!.profile_code as string) ? 0 : 1;
    return da - db || String(a.profile!.profile_code).localeCompare(String(b.profile!.profile_code));
  });

const catalogCache = new Map<string, Awaited<ReturnType<typeof loadMaisonCatalogRow<"design">>>>();
const totals = { sites: 0, exact: 0, unknownBase: 0, noDesign: 0, alreadyStamped: 0, wrote: 0 };
const stampTs = new Date().toISOString().replace(/[:.]/g, "-");

console.log(`theme-releases stamp-sites: ${ordered.length} site(s), ${write ? "WRITE (demo accounts only)" : "DRY RUN"}`);
for (const { site, profile } of ordered) {
  totals.sites += 1;
  const code = profile!.profile_code as string;
  const isDemo = DEMO_CODES.has(code);
  const tag = `${isDemo ? "[demo]" : "[talent]"} ${code} ${site.theme_design_slug}@${site.theme_design_version ?? "?"}`;
  if (!catalogCache.has(site.theme_design_slug)) {
    catalogCache.set(site.theme_design_slug, await loadMaisonCatalogRow(admin, "design", site.theme_design_slug));
  }
  const design = catalogCache.get(site.theme_design_slug);
  if (!design) {
    totals.noDesign += 1;
    console.log(`${tag}: SKIP design not in catalog`);
    continue;
  }
  const unknownBase = site.theme_design_version !== design.version;
  if (unknownBase) totals.unknownBase += 1;
  else totals.exact += 1;

  const { data: home, error: hErr } = await admin
    .from("talent_pages")
    .select("id, blocks, blocks_published")
    .eq("talent_profile_id", site.talent_profile_id)
    .eq("is_home", true)
    .maybeSingle();
  if (hErr) throw hErr;
  const tokens =
    (await loadTemplateHydrationTokens(site.talent_profile_id)) ??
    fallbackHydrationTokens(String(profile!.display_name ?? ""));
  const built = buildDesignTrees(design.payload, tokens, undefined, {
    design: design.slug,
    version: site.theme_design_version ?? design.version,
  });
  if (!built.ok) {
    console.log(`${tag}: SKIP base build failed ${built.errors.slice(0, 2).join("; ")}`);
    continue;
  }
  const shell = stampFromBase(asTree(site.shell_tree), built.shellTree, { unknownBase });
  const homeRes = stampFromBase(asTree(home?.blocks), built.homeTree, { unknownBase });
  const cShell = classifyTree(shell.tree);
  const cHome = classifyTree(homeRes.tree);
  const already = shell.stats.alreadyStamped + homeRes.stats.alreadyStamped;
  if (already > 0) totals.alreadyStamped += 1;
  console.log(
    `${tag}: ${unknownBase ? `WARN pinned v${site.theme_design_version} != catalog v${design.version}, fp "?" ` : "base exact "}` +
      `| shell matched ${shell.stats.matched} added ${shell.stats.unmatched} missing ${shell.stats.missing.length} edited ${cShell.counts.edited}` +
      ` | home matched ${homeRes.stats.matched} added ${homeRes.stats.unmatched} missing ${homeRes.stats.missing.length} edited ${cHome.counts.edited}` +
      (already ? ` | already stamped ${already}` : "") +
      (homeRes.stats.missing.length ? ` | home missing: ${homeRes.stats.missing.filter((k) => !k.includes("/")).join(",") || "(children only)"}` : ""),
  );

  const changed = shell.stats.matched + homeRes.stats.matched > 0;
  if (!write || !changed) continue;
  if (!isDemo) {
    console.log(`${tag}: not written (Phase 1A writes demo accounts only)`);
    continue;
  }
  const { data: u } = await admin.auth.admin.getUserById(profile!.user_id as string);
  const email = u.user?.email ?? "";
  if (!DEMO_EMAIL.test(email) || u.user?.app_metadata?.demo_batch !== DEMO_BATCH) {
    console.log(`${tag}: REFUSE not a demo account (${email})`);
    continue;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, `${code}-${stampTs}.json`),
    JSON.stringify({ code, takenAt: new Date().toISOString(), site, home }, null, 2),
  );
  const same = (a: unknown, b: unknown) => stableStringify(stripDesignOrigin(asTree(a))) === stableStringify(b);
  const now = new Date().toISOString();
  const { error: sErr } = await admin
    .from("talent_sites")
    .update({
      shell_tree: shell.tree,
      ...(same(shell.tree, site.shell_published) ? { shell_published: shell.tree } : {}),
      updated_at: now,
    })
    .eq("id", site.id);
  if (sErr) throw sErr;
  if (home) {
    const { error: pgErr } = await admin
      .from("talent_pages")
      .update({
        blocks: homeRes.tree,
        ...(same(homeRes.tree, home.blocks_published) ? { blocks_published: homeRes.tree } : {}),
        updated_at: now,
      })
      .eq("id", home.id);
    if (pgErr) throw pgErr;
  }
  totals.wrote += 1;
  console.log(`${tag}: wrote stamps`);
}
console.log("totals", JSON.stringify(totals));
