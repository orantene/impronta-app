import "server-only";

/**
 * The DESIGN step of a demo build: read the demo's rows, plan what its site
 * should be (the same pure build `applyDesign` runs, plus the demo's own
 * style), compare with what is stored, and write the draft. Shared by
 * `applyThemeDemos` (CLI + Builder Lab) and `rebuildDemos` (one-command rebuild),
 * so there is exactly one implementation.
 *
 * Callers own the safety check (`assertDemoTarget` / `isDemoAccount`); nothing
 * here decides whether a talent may be written.
 */
import { withPaletteOverrides } from "@/lib/talent-site/theme-catalog/design-palettes";
import type { SupabaseClient } from "@supabase/supabase-js";
import { galleryPaletteLookTokens, getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import { demoStyleTokens, styleLook, styleTrees, type MediaUrls } from "@/lib/talent-site/theme-catalog/demo-style-build";
import { MAISON_V2_DEMO_STYLES } from "@/lib/talent-site/theme-catalog/theme-demos";
import { loadTemplateHydrationTokens } from "@/lib/talent-site/server/apply-template-core";
import { loadMaisonCatalogRow } from "@/lib/talent-site/server/maison-catalog-row";
import { applyDesign, applyLook, buildDesignTrees, coerceTokenMap } from "@/lib/talent-site/server/theme-apply-core";
import { loadDemoDesignRow } from "@/lib/talent-site/theme-releases/release-design.server";
import { loadDemoContentFixture } from "./content-fixture";
import { matchOfferings, type ExistingOffering } from "./fixture-plan";
import { gridlineCopyFromFixture } from "./gridline-site-copy";
import { FOLIO_DEMO_SITE_COPY } from "./folio-site-copy";
import { applyDemoSiteCopy } from "./site-copy";
import type { DemoDesign } from "./types";
import { sameStable } from "./stable";

/** What a demo build needs to know about one demo. */
export interface DemoSpec {
  design: DemoDesign;
  palette: string;
  profileCode: string;
  /** Has a published site today (callers decide what that implies). */
  live: boolean;
  /** Keep the site's current look slug, tokens and custom palette (registry `keepLook`). */
  keepLook?: boolean;
  /** Content fixture key (registry `contentFixture`): Gridline fills its empty node text from it. */
  contentFixture?: string;
}

type Row = Record<string, unknown> & { id: string };

export interface DemoRows {
  tp: { id: string; profile_code: string; user_id: string; display_name: string };
  email: string;
  demoBatch: unknown;
  site: Row;
  pages: Row[];
  home: Row;
}

export async function loadMedia(client: SupabaseClient, talentProfileId: string): Promise<MediaUrls> {
  const { data, error } = await client
    .from("media_assets")
    .select("variant_kind, sort_order, bucket_id, storage_path, created_at")
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null)
    .eq("approval_state", "approved")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  const pub = (r: { bucket_id: string; storage_path: string }) =>
    client.storage.from(r.bucket_id).getPublicUrl(r.storage_path).data.publicUrl;
  const rows = data ?? [];
  const card = rows.find((r) => r.variant_kind === "card");
  const hero = rows.find((r) => r.variant_kind === "hero");
  return {
    card: card ? pub(card) : null,
    hero: hero ? pub(hero) : null,
    gallery: rows.filter((r) => r.variant_kind === "gallery").map(pub),
  };
}

/** The profile, its account, site and pages (every row the demo build backs up). Throws when one is missing. */
export async function loadDemoRows(admin: SupabaseClient, profileCode: string): Promise<DemoRows> {
  const { data: tp, error: tpErr } = await admin
    .from("talent_profiles")
    .select("id, profile_code, user_id, display_name")
    .eq("profile_code", profileCode)
    .is("deleted_at", null)
    .maybeSingle();
  if (tpErr) throw tpErr;
  if (!tp) throw new Error(`${profileCode}: profile not found`);
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(tp.user_id as string);
  if (uErr) throw uErr;
  const { data: site, error: siteErr } = await admin.from("talent_sites").select("*").eq("talent_profile_id", tp.id).maybeSingle();
  if (siteErr) throw siteErr;
  if (!site) throw new Error(`${profileCode}: no site`);
  const { data: pages, error: pagesErr } = await admin.from("talent_pages").select("*").eq("talent_profile_id", tp.id);
  if (pagesErr) throw pagesErr;
  const home = pages?.find((p) => p.is_home);
  if (!home) throw new Error(`${profileCode}: no home page`);
  return {
    tp: tp as DemoRows["tp"],
    email: u.user?.email ?? "",
    demoBatch: u.user?.app_metadata?.demo_batch,
    site: site as Row,
    pages: (pages ?? []) as Row[],
    home: home as Row,
  };
}

/**
 * Gridline: the design ships its spec cells, task targets, spec rows and top-bar
 * line empty; the demo fills them from its fixture through the site-copy
 * mechanism. Offering ids are resolved the way the content step matches them, so
 * a task points at the offering the content step will hold. Deterministic ids:
 * an identical rerun produces an identical tree.
 */
async function gridlineCopiedTrees(
  admin: SupabaseClient,
  tpId: string,
  key: string,
  built: { shellTree: unknown; homeTree: unknown },
): Promise<{ shellTree: unknown; homeTree: unknown }> {
  const fixture = loadDemoContentFixture(key);
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, title, status, sort_order")
    .eq("talent_profile_id", tpId)
    .order("sort_order");
  if (error) throw error;
  const existing = ((data ?? []) as Array<Record<string, unknown>>).map((o) => ({ ...o, variants: [], addons: [] })) as unknown as ExistingOffering[];
  const matched = matchOfferings(fixture, existing);
  const idByService = new Map(fixture.services.map((s, i) => [s.id, matched.get(i)?.id] as const));
  const copy = gridlineCopyFromFixture(fixture, (serviceId) => idByService.get(serviceId));
  let n = 0;
  const out = applyDemoSiteCopy(
    built.shellTree as never,
    built.homeTree as never,
    { gridline: copy },
    () => null,
    () => `gl-copy-${++n}`,
  );
  return { shellTree: out.shell, homeTree: out.home };
}

/** Folio: the design ships neutral wording; every Folio demo gets the demo wording through site-copy. */
function folioCopiedTrees(built: { shellTree: unknown; homeTree: unknown }): { shellTree: unknown; homeTree: unknown } {
  const out = applyDemoSiteCopy(
    built.shellTree as never,
    built.homeTree as never,
    { folio: FOLIO_DEMO_SITE_COPY },
    () => null,
    () => "unused",
  );
  return { shellTree: out.shell, homeTree: out.home };
}

type DemoDesignRow = NonNullable<Awaited<ReturnType<typeof loadDemoDesignRow>>>;
type Trees = ReturnType<typeof styleTrees>;
type CatalogLook = Awaited<ReturnType<typeof loadMaisonCatalogRow>>;

export interface DemoPlan {
  design: DemoDesignRow;
  style: (typeof MAISON_V2_DEMO_STYLES)[string] | undefined;
  catalogLook: CatalogLook;
  galleryTokens: Record<string, string> | null;
  lookSlug: string | undefined;
  /** The design is rebuilt but the site's colours stay exactly as they are. */
  keepLook: boolean;
  trees: Trees;
  /** The trees carry demo page copy (Gridline), so the draft trees are written, not just the design applied. */
  copied: boolean;
  nextTokens: Record<string, string>;
  nextCustom: unknown;
  /** The draft already matches what the build would write. */
  draftSame: boolean;
  /** Live-demo publish state (the Maison v2 styled legacy rule). */
  publishSame: boolean;
  /** Published bodies, shell and tokens all equal the draft (nothing to publish). */
  publishedInSync: boolean;
}

/** PURE: the published side equals the draft side. */
export function isPublishedInSync(site: Row, pages: Row[]): boolean {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return (
    sameStable(list(site.shell_published), list(site.shell_tree)) &&
    sameStable(coerceTokenMap(site.design_tokens), coerceTokenMap(site.design_tokens_draft)) &&
    pages.every((p) => sameStable(list(p.blocks_published), list(p.blocks)))
  );
}

/** What the demo's site should be and whether it already is. Reads only. */
export async function planDemoDesign(admin: SupabaseClient, spec: DemoSpec, rows: DemoRows): Promise<DemoPlan> {
  const { tp, site, home, pages } = rows;
  // The newest RELEASED version (never the gated catalog row), like a talent's apply.
  const design = await loadDemoDesignRow(admin, spec.design);
  if (!design) throw new Error(`design ${spec.design} not found`);
  const gallery = getGalleryDesign(spec.design);
  const keepLook = spec.keepLook === true;
  if (!keepLook && !gallery?.palettes.some((p) => p.key === spec.palette)) {
    throw new Error(`${spec.design} has no palette ${spec.palette}`);
  }
  const style = spec.design === "maison-v2" ? MAISON_V2_DEMO_STYLES[spec.profileCode] : undefined;
  const catalogLook = keepLook ? null : spec.design === "folio" ? await loadMaisonCatalogRow(admin, "look", `folio-${spec.palette}`) : null;
  const styled = style && !keepLook ? styleLook(style, spec.palette, spec.profileCode) : null;
  const galleryTokens = keepLook ? null : catalogLook ? null : (styled?.look ?? galleryPaletteLookTokens(spec.design, spec.palette));
  const lookSlug = keepLook
    ? ((site.theme_look_slug as string | null) ?? undefined)
    : (catalogLook?.slug ?? (styled ? (styled.lookSlug ?? undefined) : spec.palette));

  const tokens = await loadTemplateHydrationTokens(tp.id);
  if (!tokens) throw new Error(`${spec.profileCode}: hydration tokens unavailable`);
  const built = buildDesignTrees(design.payload, tokens, undefined, { design: design.slug, version: design.version });
  if (!built.ok) throw new Error(`${spec.profileCode}: build failed ${built.errors.join("; ")}`);
  const copied =
    !style && spec.design === "gridline" && !!spec.contentFixture
      ? ((await gridlineCopiedTrees(admin, tp.id, spec.contentFixture, built)) as Trees)
      : !style && spec.design === "folio"
        ? (folioCopiedTrees(built) as Trees)
        : null;
  const trees = style
    ? styleTrees(built, style, await loadMedia(admin, tp.id), spec.profileCode)
    : (copied ?? { shellTree: built.shellTree, homeTree: built.homeTree });
  const nextTokens = {
    ...(keepLook
      ? ((site.design_tokens_draft as Record<string, string> | null) ?? {})
      : mergeLookIntoTokens(
          (site.design_tokens_draft as Record<string, string> | null) ?? {},
          withPaletteOverrides(
            catalogLook ? catalogLook.payload.tokens : galleryTokens!,
            design.payload,
            styled ? null : spec.palette,
          ),
        )),
    ...demoStyleTokens(style),
  };
  const nextCustom = keepLook ? (site.custom_palette ?? null) : (styled?.customPalette ?? null);
  const draftSame =
    site.theme_design_slug === spec.design &&
    site.theme_design_version === design.version &&
    (site.theme_look_slug ?? null) === (lookSlug ?? null) &&
    sameStable(site.custom_palette ?? null, nextCustom) &&
    sameStable(site.shell_tree, trees.shellTree) &&
    sameStable(home.blocks, trees.homeTree) &&
    sameStable(site.design_tokens_draft, nextTokens);
  const publishSame =
    !spec.live ||
    !style ||
    (sameStable(site.shell_published, trees.shellTree) &&
      sameStable(home.blocks_published, trees.homeTree) &&
      sameStable(site.design_tokens, nextTokens));
  return {
    design,
    style,
    catalogLook,
    galleryTokens,
    lookSlug,
    keepLook,
    trees,
    copied: copied !== null,
    nextTokens,
    nextCustom,
    draftSame,
    publishSame,
    publishedInSync: isPublishedInSync(site, pages),
  };
}

/** Write the planned draft (design, look, style). Does not publish. */
export async function writeDemoDraft(
  admin: SupabaseClient,
  spec: DemoSpec,
  rows: DemoRows,
  plan: DemoPlan,
): Promise<void> {
  const { tp, site, home } = rows;
  const { design, catalogLook, galleryTokens, lookSlug, keepLook, style, copied, trees, nextTokens, nextCustom } = plan;
  const d = await applyDesign(admin, {
    talentProfileId: tp.id,
    siteId: site.id,
    design,
    displayName: tp.display_name,
    userId: tp.user_id,
  });
  if (!d.ok) throw new Error(`${spec.profileCode} applyDesign: ${d.error}`);
  if (catalogLook) {
    const l = await applyLook(admin, { siteId: site.id, look: catalogLook, userId: tp.user_id });
    if (!l.ok) throw new Error(`${spec.profileCode} applyLook: ${l.error}`);
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_sites")
    .update({
      ...(galleryTokens || keepLook || catalogLook ? { design_tokens_draft: nextTokens, theme_look_slug: lookSlug ?? null } : {}),
      ...(style || copied ? { shell_tree: trees.shellTree } : {}),
      custom_palette: nextCustom,
      pending_design: null,
      draft_updated_at: now,
      updated_at: now,
    })
    .eq("id", site.id)
    .eq("talent_profile_id", tp.id);
  if (error) throw error;
  if (style || copied) {
    const { error: hErr } = await admin
      .from("talent_pages")
      .update({ blocks: trees.homeTree, updated_at: now })
      .eq("id", home.id)
      .eq("talent_profile_id", tp.id);
    if (hErr) throw hErr;
  }
}
