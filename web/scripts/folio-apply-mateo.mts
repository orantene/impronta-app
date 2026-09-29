/**
 * Re-apply Folio + stone look to Mateo (TAL-93011) and publish.
 * Demo-only. Does not reseed content packs.
 */
import { createClient } from "@supabase/supabase-js";

const { loadMaisonCatalogRow } = await import("../src/lib/talent-site/server/maison-catalog-row");
const { applyDesign, publishSiteTheme } = await import("../src/lib/talent-site/server/theme-apply-core");
const { publishTalentPageBodies } = await import("../src/lib/talent-site/server/publish-talent-page-bodies");
const { folioLookTokensFromCode } = await import("../src/lib/talent-site/theme-catalog/collection/folio-looks");
const folioDefaults = await import("../src/lib/talent-site/theme-catalog/collection/folio-defaults");
const { mergeLookIntoTokens } = await import("../src/lib/talent-site/theme-catalog/look-layer");

const FOLIO_STYLE_TOKEN_DEFAULTS =
  folioDefaults.FOLIO_STYLE_TOKEN_DEFAULTS;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}

const PROFILE_ID = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";
const USER_ID = "ec3e63db-83a1-43e3-9fd7-223d56b87bc5";
const CODE = "TAL-93011";

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: u } = await admin.auth.admin.getUserById(USER_ID);
if (u.user?.app_metadata?.demo_batch !== "demo-2026-09-28") {
  throw new Error("REFUSE: not Mateo demo batch");
}
const { data: tp } = await admin
  .from("talent_profiles")
  .select("profile_code, display_name, user_id")
  .eq("id", PROFILE_ID)
  .single();
if (!tp || tp.profile_code !== CODE || tp.user_id !== USER_ID) throw new Error("REFUSE: profile mismatch");

const { data: site } = await admin
  .from("talent_sites")
  .select("id")
  .eq("talent_profile_id", PROFILE_ID)
  .single();
if (!site) throw new Error("no site");

const design = await loadMaisonCatalogRow(admin, "design", "folio");
if (!design) throw new Error("folio design not in catalog");

const d = await applyDesign(admin, {
  talentProfileId: PROFILE_ID,
  siteId: site.id,
  design,
  displayName: tp.display_name,
  userId: USER_ID,
});
if (!d.ok) throw new Error(`applyDesign: ${d.error}`);

const lookTokens = folioLookTokensFromCode("folio-stone");
if (!lookTokens) throw new Error("folio-stone look missing");
if (!FOLIO_STYLE_TOKEN_DEFAULTS) throw new Error("FOLIO_STYLE_TOKEN_DEFAULTS missing");

const { data: cur } = await admin.from("talent_sites").select("design_tokens_draft").eq("id", site.id).single();
const draft = mergeLookIntoTokens(
  {
    ...((cur?.design_tokens_draft as Record<string, string> | null) ?? {}),
    ...FOLIO_STYLE_TOKEN_DEFAULTS,
  },
  lookTokens,
);
const { error: tokErr } = await admin
  .from("talent_sites")
  .update({
    design_tokens_draft: draft,
    theme_look_slug: "folio-stone",
    theme_design_slug: "folio",
    custom_palette: null,
    pending_design: null,
    updated_at: new Date().toISOString(),
  })
  .eq("id", site.id);
if (tokErr) throw tokErr;

const now = new Date().toISOString();
const pages = await publishTalentPageBodies(admin, { talentProfileId: PROFILE_ID, now });
if (!pages.ok) throw new Error("publish pages failed");
const { data: fresh } = await admin.from("talent_sites").select("shell_tree").eq("id", site.id).single();
const { error: pubErr } = await admin
  .from("talent_sites")
  .update({
    shell_published: fresh?.shell_tree ?? [],
    site_published_at: now,
    status: "published",
    published_at: now,
    updated_at: now,
    updated_by: USER_ID,
  })
  .eq("id", site.id);
if (pubErr) throw pubErr;
const t = await publishSiteTheme(admin, { siteId: site.id, profileCode: CODE });
if (!t.ok) throw new Error(`publishSiteTheme: ${t.error}`);

/** Script-context hydration: loadTemplateHydrationTokens needs cookies; fill cover/bio from admin. */
async function patchMateoMagazineCover() {
  const { data: media } = await admin
    .from("media_assets")
    .select("storage_path,bucket_id,variant_kind,sort_order")
    .eq("owner_talent_profile_id", PROFILE_ID)
    .order("sort_order", { ascending: true });
  const head = (media ?? []).find((m) => m.variant_kind === "card") ?? media?.[0];
  const base = url.replace(/\/$/, "");
  const publicUrl = head
    ? `${base}/storage/v1/object/public/${head.bucket_id}/${head.storage_path}`
    : "";
  const { data: prof } = await admin
    .from("talent_profiles")
    .select("short_bio")
    .eq("id", PROFILE_ID)
    .single();
  const bio = (prof?.short_bio ?? "").trim();
  const patch = (nodes: any[]): any[] =>
    (nodes ?? []).map((n) => {
      if (!n || typeof n !== "object") return n;
      let next = n;
      if (n.kind === "masthead") {
        next = {
          ...n,
          props: {
            ...(n.props ?? {}),
            coverSrc: publicUrl || n.props?.coverSrc || "",
            bio: bio || n.props?.bio || "",
            coverLine: n.props?.coverLine || "Modelo · CDMX",
            showCover: true,
            edition: "magazine",
          },
        };
      }
      if (Array.isArray(n.children)) next = { ...next, children: patch(n.children) };
      return next;
    });
  const { data: page } = await admin
    .from("talent_pages")
    .select("id, blocks")
    .eq("talent_profile_id", PROFILE_ID)
    .eq("is_home", true)
    .single();
  if (!page) return;
  const nodes = patch(page.blocks ?? []);
  const at = new Date().toISOString();
  const { error } = await admin
    .from("talent_pages")
    .update({ blocks: nodes, blocks_published: nodes, updated_at: at })
    .eq("id", page.id);
  if (error) throw error;
}

await patchMateoMagazineCover();

console.log("applied folio + folio-stone to", CODE, tp.display_name);
