/**
 * Apply the Maison design to every demo talent in a seed manifest and publish
 * it. Uses the app's own apply + publish cores (theme-apply-core,
 * publishTalentPageBodies, publishSiteTheme) with the design hydrated from
 * each talent's real profile, services and photos; no hand-written trees.
 *
 * Demo sites only: every entry is re-checked as a demo (TAL-93xxx, demo_batch
 * user, matching profile) before anything is written.
 *
 * Run (from web/). The stubs let server-only modules load outside Next and
 * stand in for the cookie session client, which scripts don't have:
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> \
 *     scripts/demo-talents/apply-maison.mts --manifest <path.json> [--only TAL-93001]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import * as maisonCatalogRowMod from "../../src/lib/talent-site/server/maison-catalog-row";
import * as themeApplyCoreMod from "../../src/lib/talent-site/server/theme-apply-core";
import * as publishBodiesMod from "../../src/lib/talent-site/server/publish-talent-page-bodies";
import * as maisonSeedMod from "../../src/lib/talent-site/theme-catalog/maison/seed";
import * as folioLooksMod from "../../src/lib/talent-site/theme-catalog/collection/folio-looks";
import * as demosMod from "./demos";

/** tsx loads .ts from .mts as CJS — named exports sit on `default`. */
function namedFromCjs<T extends object>(mod: T | { default: T }): T {
  if (mod && typeof mod === "object" && "default" in mod) {
    const d = (mod as { default: unknown }).default;
    if (d && typeof d === "object") return d as T;
  }
  return mod as T;
}

const { loadMaisonCatalogRow } = namedFromCjs(
  maisonCatalogRowMod as typeof import("../../src/lib/talent-site/server/maison-catalog-row"),
);
const { applyDesign, applyLook, publishSiteTheme } = namedFromCjs(
  themeApplyCoreMod as typeof import("../../src/lib/talent-site/server/theme-apply-core"),
);
const { publishTalentPageBodies } = namedFromCjs(
  publishBodiesMod as typeof import("../../src/lib/talent-site/server/publish-talent-page-bodies"),
);
const { MAISON_PALETTE_ORDER } = namedFromCjs(
  maisonSeedMod as typeof import("../../src/lib/talent-site/theme-catalog/maison/seed"),
);
const { COLLECTION_DEFAULT_LOOK } = namedFromCjs(
  folioLooksMod as typeof import("../../src/lib/talent-site/theme-catalog/collection/folio-looks"),
);
const { DEMO_BATCH, DEMOS } = namedFromCjs(demosMod as typeof import("./demos"));

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
const manifestPath = opt("--manifest");
if (!manifestPath) throw new Error("--manifest <path.json> is required");
const only = opt("--only")?.split(",");
const designSlug = opt("--design") ?? "maison";
const lookOverride = opt("--look");
const keepLook = args.includes("--keep-look");
const demoByCode = new Map(DEMOS.map((d) => [d.profileCode, d]));

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Entry = { profileCode: string; email: string; userId: string; talentProfileId: string };
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  targetRef: string;
  entries: Record<string, Entry>;
};
if (manifest.targetRef !== targetRef) throw new Error(`manifest is for ${manifest.targetRef}`);

const design = await loadMaisonCatalogRow(admin, "design", designSlug);
if (!design) throw new Error(`design ${designSlug} not found`);

const entries = Object.values(manifest.entries)
  .filter((e) => !only || only.includes(e.profileCode))
  .sort((a, b) => a.profileCode.localeCompare(b.profileCode));

for (const [i, e] of entries.entries()) {
  if (!/^TAL-93\d{3}$/.test(e.profileCode) || !e.email.endsWith("@impronta.test")) {
    throw new Error(`REFUSE: not a demo entry ${e.profileCode}`);
  }
  const { data: u } = await admin.auth.admin.getUserById(e.userId);
  if (u.user?.app_metadata?.demo_batch !== DEMO_BATCH) throw new Error(`REFUSE: ${e.email} is not a demo user`);
  const { data: tp } = await admin
    .from("talent_profiles")
    .select("profile_code, user_id, display_name")
    .eq("id", e.talentProfileId)
    .maybeSingle();
  if (!tp || tp.profile_code !== e.profileCode || tp.user_id !== e.userId) {
    throw new Error(`REFUSE: ${e.talentProfileId} does not match manifest`);
  }
  const { data: site } = await admin
    .from("talent_sites")
    .select("id, shell_tree")
    .eq("talent_profile_id", e.talentProfileId)
    .maybeSingle();
  if (!site) throw new Error(`no site for ${e.profileCode}`);

  // Look: explicit --look, else the demo's `look`, else Folio stone / Maison rotate.
  const demo = demoByCode.get(e.profileCode);
  let lookSlug: string | null = null;
  if (!keepLook) {
    if (lookOverride) lookSlug = lookOverride;
    else if (demo?.look) lookSlug = demo.look;
    else if (designSlug === "folio" || designSlug.startsWith("folio")) {
      lookSlug = COLLECTION_DEFAULT_LOOK.folio ?? "folio-stone";
    } else if (designSlug === "maison" || designSlug.startsWith("maison")) {
      const paletteKey = ["TAL-93002", "TAL-93003"].includes(e.profileCode)
        ? MAISON_PALETTE_ORDER[0]
        : MAISON_PALETTE_ORDER[(i % (MAISON_PALETTE_ORDER.length - 1)) + 1];
      lookSlug = `maison-${paletteKey}`;
    }
  }
  const look = lookSlug ? await loadMaisonCatalogRow(admin, "look", lookSlug) : null;
  if (lookSlug && !look) throw new Error(`look ${lookSlug} not found`);

  const d = await applyDesign(admin, {
    talentProfileId: e.talentProfileId,
    siteId: site.id,
    design,
    displayName: tp.display_name,
    userId: e.userId,
  });
  if (!d.ok) throw new Error(`${e.profileCode} applyDesign: ${d.error}`);
  if (look) {
    const l = await applyLook(admin, { siteId: site.id, look, userId: e.userId });
    if (!l.ok) throw new Error(`${e.profileCode} applyLook: ${l.error}`);
  }

  const now = new Date().toISOString();
  const { error: metaErr } = await admin
    .from("talent_sites")
    .update({
      pending_design: null,
      theme_design_slug: designSlug,
      ...(lookSlug ? { theme_look_slug: lookSlug } : {}),
      updated_at: now,
    })
    .eq("id", site.id);
  if (metaErr) throw metaErr;

  const pages = await publishTalentPageBodies(admin, { talentProfileId: e.talentProfileId, now });
  if (!pages.ok) throw new Error(`${e.profileCode} publish pages failed`);
  const { data: fresh } = await admin.from("talent_sites").select("shell_tree").eq("id", site.id).single();
  const { error: pubErr } = await admin
    .from("talent_sites")
    .update({
      shell_published: fresh?.shell_tree ?? [],
      site_published_at: now,
      status: "published",
      published_at: now,
      updated_at: now,
      updated_by: e.userId,
    })
    .eq("id", site.id);
  if (pubErr) throw pubErr;
  const t = await publishSiteTheme(admin, { siteId: site.id, profileCode: e.profileCode });
  if (!t.ok) throw new Error(`${e.profileCode} publishSiteTheme: ${t.error}`);
  console.log(designSlug, e.profileCode, tp.display_name, lookSlug ? `look ${lookSlug}` : "no-look", "published");
}
console.log("done");
