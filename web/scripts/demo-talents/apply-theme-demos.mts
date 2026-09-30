/**
 * Build the Maison v2 and Folio demo talents as real site DRAFTS (2026-09-30).
 *
 * For each demo in THEME_DEMOS: apply the design's section layout hydrated
 * with the talent's OWN profile, services and photos (theme-apply-core
 * `applyDesign`, the same core the builder uses) plus the demo's gallery
 * palette as draft tokens. Nothing is published:
 *  - new demos (live: false) stay unpublished; the gallery "Demo content"
 *    preview reads their draft trees (loadDemoSavedTrees falls back to
 *    `blocks` / `shell_tree` when nothing is published);
 *  - live demos (live: true) must already wear the design; only their DRAFT is
 *    rewritten, their published shell/body/tokens are never touched.
 *
 * Safety: every row is re-checked as a demo (profile code in THEME_DEMOS,
 * demo_batch user, @demo.tulala.digital or demo-*@impronta.test email) and
 * the site + page rows are backed up as JSON before any write.
 *
 * Dry run by default (prints the plan and whether each draft would change).
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/demo-talents/apply-theme-demos.mts [--only TAL-93103,TAL-93109] [--yes-write]
 *     [--backup-dir <dir>] [--sync-catalog]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { loadMaisonCatalogRow } = await import("../../src/lib/talent-site/server/maison-catalog-row");
const { applyDesign, applyLook, buildDesignTrees } = await import(
  "../../src/lib/talent-site/server/theme-apply-core"
);
const { loadTemplateHydrationTokens } = await import("../../src/lib/talent-site/server/apply-template-core");
const { galleryPaletteLookTokens, getGalleryDesign } = await import(
  "../../src/lib/talent-site/theme-catalog/gallery-meta"
);
const { THEME_DEMOS } = await import("../../src/lib/talent-site/theme-catalog/theme-demos");
const { mergeLookIntoTokens } = await import("../../src/lib/talent-site/theme-catalog/look-layer");
const { syncBuiltinTalentThemes } = await import(
  "../../src/lib/talent-site/theme-catalog/sync-builtins.server"
);
const { DEMO_BATCH } = await import("./demos");

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
const only = opt("--only")?.split(",");
const backupDir =
  opt("--backup-dir") ?? path.join(os.homedir(), "Desktop/tulala-exports/demo-foundation/backups");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_EMAIL = /^(?:[^@]+@demo\.tulala\.digital|demo-[^@]+@impronta\.test)$/;
const stable = (v: unknown) => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : x,
);

if (args.includes("--sync-catalog")) {
  if (!write) console.log("[dry] would run syncBuiltinTalentThemes");
  else console.log("catalog sync", JSON.stringify(await syncBuiltinTalentThemes(admin, null)));
}

const targets = THEME_DEMOS.filter((d) => !only || only.includes(d.profileCode));
if (only && targets.length !== only.length) throw new Error(`--only has codes not in THEME_DEMOS`);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

for (const demo of targets) {
  const { data: tp } = await admin
    .from("talent_profiles")
    .select("id, profile_code, user_id, display_name")
    .eq("profile_code", demo.profileCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tp) throw new Error(`${demo.profileCode}: profile not found`);
  const { data: u } = await admin.auth.admin.getUserById(tp.user_id as string);
  const email = u.user?.email ?? "";
  if (!DEMO_EMAIL.test(email) || u.user?.app_metadata?.demo_batch !== DEMO_BATCH) {
    throw new Error(`REFUSE: ${demo.profileCode} (${email}) is not a demo account`);
  }
  const { data: site } = await admin.from("talent_sites").select("*").eq("talent_profile_id", tp.id).maybeSingle();
  if (!site) throw new Error(`${demo.profileCode}: no site`);
  const { data: pages } = await admin.from("talent_pages").select("*").eq("talent_profile_id", tp.id);
  const home = pages?.find((p) => p.is_home);
  if (!home) throw new Error(`${demo.profileCode}: no home page`);

  const isPublished = Array.isArray(site.shell_published) || !!site.site_published_at;
  if (demo.live && site.theme_design_slug !== demo.design) {
    throw new Error(
      `REFUSE: live demo ${demo.profileCode} wears ${site.theme_design_slug}, not ${demo.design}; switch it by hand`,
    );
  }
  if (!demo.live && isPublished) {
    throw new Error(`REFUSE: ${demo.profileCode} is published but listed as a new (unpublished) demo`);
  }

  const design = await loadMaisonCatalogRow(admin, "design", demo.design);
  if (!design) throw new Error(`design ${demo.design} not found`);
  const gallery = getGalleryDesign(demo.design);
  if (!gallery?.palettes.some((p) => p.key === demo.palette)) {
    throw new Error(`${demo.design} has no palette ${demo.palette}`);
  }
  const catalogLook = demo.design === "folio" ? await loadMaisonCatalogRow(admin, "look", `folio-${demo.palette}`) : null;
  const galleryTokens = catalogLook ? null : galleryPaletteLookTokens(demo.design, demo.palette);
  const lookSlug = catalogLook?.slug ?? demo.palette;

  // Would the draft change? Same pure build applyDesign runs.
  const tokens = await loadTemplateHydrationTokens(tp.id as string);
  if (!tokens) throw new Error(`${demo.profileCode}: hydration tokens unavailable`);
  const built = buildDesignTrees(design.payload, tokens);
  if (!built.ok) throw new Error(`${demo.profileCode}: build failed ${built.errors.join("; ")}`);
  const nextTokens = mergeLookIntoTokens(
    (site.design_tokens_draft as Record<string, string> | null) ?? {},
    catalogLook ? catalogLook.payload.tokens : galleryTokens!,
  );
  const same =
    site.theme_design_slug === demo.design &&
    site.theme_design_version === design.version &&
    site.theme_look_slug === lookSlug &&
    stable(site.shell_tree) === stable(built.shellTree) &&
    stable(home.blocks) === stable(built.homeTree) &&
    stable(site.design_tokens_draft) === stable(nextTokens);

  const label = `${demo.profileCode} ${tp.display_name} → ${demo.design}/${lookSlug} ${demo.live ? "(LIVE: draft only)" : "(unpublished)"}`;
  if (same) {
    console.log("unchanged", label);
    continue;
  }
  if (!write) {
    console.log("[dry] would write", label, `home ${built.homeTree.length} sections, shell ${built.shellTree.length}`);
    continue;
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${demo.profileCode}-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ profileCode: demo.profileCode, email, takenAt: new Date().toISOString(), talent_sites: site, talent_pages: pages }, null, 2),
  );

  const d = await applyDesign(admin, {
    talentProfileId: tp.id as string,
    siteId: site.id as string,
    design,
    displayName: tp.display_name as string,
    userId: tp.user_id as string,
  });
  if (!d.ok) throw new Error(`${demo.profileCode} applyDesign: ${d.error}`);
  if (catalogLook) {
    const l = await applyLook(admin, { siteId: site.id as string, look: catalogLook, userId: tp.user_id as string });
    if (!l.ok) throw new Error(`${demo.profileCode} applyLook: ${l.error}`);
  }
  const { error } = await admin
    .from("talent_sites")
    .update({
      ...(galleryTokens ? { design_tokens_draft: nextTokens, theme_look_slug: lookSlug } : {}),
      custom_palette: null,
      pending_design: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", site.id)
    .eq("talent_profile_id", tp.id);
  if (error) throw error;
  console.log("wrote", label, "backup", backupFile);
}
console.log(write ? "done" : "dry run done (pass --yes-write to apply)");
