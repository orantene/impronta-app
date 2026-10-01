// SUPERSEDED by `npm run demos:rebuild` (scripts/demo-talents/rebuild.mjs): one command, backup + restore, dry run by default.
console.error("[demo-talents] superseded: use `npm run demos:rebuild` (dry run by default, --write to apply).");
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
import { loadMaisonCatalogRow } from "../../src/lib/talent-site/server/maison-catalog-row";
import { loadDemoDesignRow } from "../../src/lib/talent-site/theme-releases/release-design.server";
import { galleryPaletteLookTokens } from "../../src/lib/talent-site/theme-catalog/gallery-meta";
import { mergeLookIntoTokens } from "../../src/lib/talent-site/theme-catalog/look-layer";
import { DEMOS } from "./demos";
import { applyDesign, applyLook } from "../../src/lib/talent-site/server/theme-apply-core";
import { publishDemoSite } from "../../src/lib/talent-site/server/demo-pipeline.server";
import { MAISON_BUILTIN_DEMO } from "../../src/lib/talent-site/theme-catalog/maison/builtins";
import { MAISON_PALETTE_ORDER } from "../../src/lib/talent-site/theme-catalog/maison/seed";
import { DEMO_BATCH } from "./demos";

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
const keepLook = args.includes("--keep-look");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Entry = { profileCode: string; email: string; userId: string; talentProfileId: string };
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  targetRef: string;
  entries: Record<string, Entry>;
};
if (manifest.targetRef !== targetRef) throw new Error(`manifest is for ${manifest.targetRef}`);

// The newest released version (v21 today), never the gated catalog row.
const design = await loadDemoDesignRow(admin, designSlug);
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

  // Beauty demos keep Maison's default palette; the rest rotate through the
  // others so the ten sites don't all look the same.
  const paletteKey = ["TAL-93002", "TAL-93003"].includes(e.profileCode)
    ? MAISON_PALETTE_ORDER[0]
    : MAISON_PALETTE_ORDER[(i % (MAISON_PALETTE_ORDER.length - 1)) + 1];
  // Maison v2 wears its OWN gallery palette (Alba = rose), never a Maison v1 look.
  const v2Palette = designSlug === "maison-v2" ? DEMOS.find((x) => x.profileCode === e.profileCode)?.palette : undefined;
  if (designSlug === "maison-v2" && !v2Palette) throw new Error(`${e.profileCode} has no maison-v2 palette in demos.ts`);
  const v2Tokens = v2Palette ? galleryPaletteLookTokens("maison-v2", v2Palette) : null;
  if (v2Palette && !v2Tokens) throw new Error(`maison-v2 has no gallery palette ${v2Palette}`);
  const look = keepLook || v2Tokens ? null : await loadMaisonCatalogRow(admin, "look", `maison-${paletteKey}`);
  if (!keepLook && !v2Tokens && !look) throw new Error(`look maison-${paletteKey} not found`);

  const d = await applyDesign(admin, {
    talentProfileId: e.talentProfileId,
    siteId: site.id,
    design,
    displayName: tp.display_name,
    userId: e.userId,
  });
  if (!d.ok) throw new Error(`${e.profileCode} applyDesign: ${d.error}`);
  if (look) { const l = await applyLook(admin, { siteId: site.id, look, userId: e.userId }); if (!l.ok) throw new Error(`${e.profileCode} applyLook: ${l.error}`); }

  const now = new Date().toISOString();
  if (v2Tokens) {
    const { data: cur } = await admin.from("talent_sites").select("design_tokens_draft").eq("id", site.id).single();
    const { error: tokErr } = await admin
      .from("talent_sites")
      .update({ design_tokens_draft: mergeLookIntoTokens((cur?.design_tokens_draft as Record<string, string> | null) ?? {}, v2Tokens) })
      .eq("id", site.id);
    if (tokErr) throw tokErr;
  }
  const { error: metaErr } = await admin
    .from("talent_sites")
    .update({
      pending_design: null,
      updated_at: now,
    })
    .eq("id", site.id);
  if (metaErr) throw metaErr;

  await publishDemoSite(admin, { siteId: site.id, talentProfileId: e.talentProfileId, profileCode: e.profileCode, userId: e.userId });
  console.log(designSlug, e.profileCode, tp.display_name, `palette ${v2Palette ?? paletteKey}`, "published");
}
console.log("done");
