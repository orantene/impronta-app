/**
 * Build the Maison v2 and Folio demo talents as real sites (2026-09-30).
 *
 * For each demo in THEME_DEMOS: apply the design's section layout hydrated
 * with the talent's OWN profile, services and photos (theme-apply-core
 * `buildDesignTrees`, the same core the builder uses) plus the demo's look as
 * draft tokens.
 *
 * Maison v2 demos with a style in MAISON_V2_DEMO_STYLES (theme-demos.ts) then
 * become visually DISTINCT sites through editable settings only:
 *  - palette: built-in gallery palette, or a custom palette (custom_palette +
 *    colour tokens, exactly what the builder's custom-colours step writes);
 *  - font pair (Google Fonts catalogue families as typography tokens) and
 *    shape/type tokens (corners, button style, accent style);
 *  - section variants: hero photo side + columns, hero portrait (the talent's
 *    card, F21) and inset (a detail shot from her own media, F20), ticker
 *    on/off, portfolio layout, menu thumbnails / category nav / columns,
 *    footer band tone;
 *  - section order per trade.
 *
 * Publishing:
 *  - new demos (live: false) stay unpublished; the gallery "Demo content"
 *    preview reads their draft trees + design_tokens_draft;
 *  - live demos (live: true) get the draft rewritten AND published (owner
 *    approved 2026-09-30), so the gallery shows the new version.
 * Camila (TAL-93003) also gets the guide's 4th service (batch-1.json DEMO001,
 * "Relleno de acrílico", guide price), inserted once.
 *
 * Safety: every row is re-checked as a demo (profile code in THEME_DEMOS,
 * demo_batch user, @demo.tulala.digital or demo-*@impronta.test email) and
 * the site + page rows are backed up as JSON before any write. Idempotent:
 * a demo whose draft (and, when live, published state) already matches is
 * reported "unchanged" and not touched.
 *
 * Dry run by default (prints the plan and whether each site would change).
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=.env.local \
 *     scripts/demo-talents/apply-theme-demos.mts [--only TAL-93103,TAL-93109] [--yes-write]
 *     [--backup-dir <dir>] [--sync-catalog]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";
import type {
  MaisonV2DemoStyle,
  ThemeDemoMediaRef,
} from "../../src/lib/talent-site/theme-catalog/theme-demos";

const { loadMaisonCatalogRow } = await import("../../src/lib/talent-site/server/maison-catalog-row");
const { applyDesign, applyLook, buildDesignTrees, publishSiteTheme } = await import(
  "../../src/lib/talent-site/server/theme-apply-core"
);
const { publishTalentPageBodies } = await import("../../src/lib/talent-site/server/publish-talent-page-bodies");
const { loadTemplateHydrationTokens } = await import("../../src/lib/talent-site/server/apply-template-core");
const { galleryPaletteLookTokens, getGalleryDesign } = await import(
  "../../src/lib/talent-site/theme-catalog/gallery-meta"
);
const { THEME_DEMOS, MAISON_V2_DEMO_STYLES, MAISON_V2_SECTION_LABELS } = await import(
  "../../src/lib/talent-site/theme-catalog/theme-demos"
);
const { mergeLookIntoTokens } = await import("../../src/lib/talent-site/theme-catalog/look-layer");
const { cssFamilyForGoogleFont, getGoogleFontMeta } = await import(
  "../../src/lib/site-admin/builder-node/fonts-catalog"
);
const { contrastRatio } = await import("../../src/lib/site-admin/tokens/contrast-pair");
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

// ── Guide service for Camila (batch-1.json, DEMO001 = TAL-93003) ─────────────
// The guide lists four services; her site has three. Guide values verbatim.
const GUIDE_EXTRA_SERVICES: Record<string, { after: string; row: Record<string, unknown> }> = {
  "TAL-93003": {
    after: "Set acrílico",
    row: {
      title: "Relleno de acrílico",
      description: "Mantenimiento de tu set a las 2 o 3 semanas, con cambio de color incluido.",
      title_i18n: { es: "Relleno de acrílico", en: "Acrylic fill" },
      description_i18n: {
        es: "Mantenimiento de tu set a las 2 o 3 semanas, con cambio de color incluido.",
        en: "Maintenance for your set at 2 or 3 weeks, color change included.",
      },
      category: "Uñas esculpidas",
      category_i18n: { es: "Uñas esculpidas", en: "Sculpted Nails" },
      amount_cents: 42000,
      currency: "MXN",
      price_display: "exact",
      booking_mode: "instant",
      duration_minutes: 90,
    },
  },
};

// ── Style transforms (pure; builder nodes only, every value editable) ────────

type Props = Record<string, unknown>;
const propsOf = (n: BuilderNode) => (n.props ?? {}) as Props;
const kidsOf = (n: BuilderNode): BuilderNode[] =>
  "children" in n && Array.isArray(n.children) ? (n.children as BuilderNode[]) : [];
const styleOf = (n: BuilderNode) => (propsOf(n).style as Props | undefined) ?? {};
const withProps = (n: BuilderNode, patch: Props, kids?: BuilderNode[]): BuilderNode =>
  ({ ...n, props: { ...propsOf(n), ...patch }, ...(kids ? { children: kids } : {}) }) as BuilderNode;
const mapTree = (n: BuilderNode, f: (n: BuilderNode) => BuilderNode): BuilderNode => {
  const kids = kidsOf(n);
  const next = kids.length ? withProps(n, {}, kids.map((k) => mapTree(k, f))) : n;
  return f(next);
};
const label = (n: BuilderNode) => propsOf(n).layerLabel as string | undefined;

type MediaUrls = { card: string | null; hero: string | null; gallery: string[] };

function mediaUrl(media: MediaUrls, ref: ThemeDemoMediaRef, code: string): string {
  const u = ref.kind === "card" ? media.card : media.gallery[ref.index];
  if (!u) throw new Error(`${code}: no ${ref.kind === "card" ? "card" : `gallery #${ref.index}`} photo`);
  return u;
}

function styleHero(hero: BuilderNode, style: MaisonV2DemoStyle, media: MediaUrls, code: string): BuilderNode {
  const [a, b] = style.hero.columns.split(/\s+/);
  const left = style.hero.media === "left";
  const photo = style.hero.photo ? mediaUrl(media, style.hero.photo, code) : null;
  const inset = style.hero.inset ? mediaUrl(media, style.hero.inset, code) : null;
  const inner = mapTree(hero, (n) => {
    if (n.kind === "image" && label(n) === "Hero photo" && photo) return withProps(n, { src: photo });
    if (n.kind === "image" && label(n) === "Hero inset") {
      const { right: _r, left: _l, ...rest } = styleOf(n);
      void _r;
      void _l;
      return withProps(n, {
        ...(inset ? { src: inset, alt: "" } : {}),
        style: { ...rest, ...(left ? { left: "-26px" } : { right: "-26px" }) },
      });
    }
    return n;
  });
  const kids = kidsOf(inner);
  const media0 = kids.findIndex((k) => label(k) === "Hero media");
  const copy = kids.filter((_, i) => i !== media0);
  const ordered = media0 < 0 ? kids : left ? [kids[media0]!, ...copy] : [...copy, kids[media0]!];
  return withProps(
    inner,
    { style: { ...styleOf(inner), gridTemplateColumns: left ? `${b} ${a}` : `${a} ${b}` } },
    ordered,
  );
}

function styleWork(work: BuilderNode, style: MaisonV2DemoStyle): BuilderNode {
  const kids = kidsOf(work)
    .filter((k) => style.ticker || k.kind !== "marquee")
    .map((k) =>
      k.kind === "portfolio"
        ? withProps(k, {
            layout: style.portfolio.layout,
            columns: style.portfolio.columns,
            limit: style.portfolio.columns === 4 ? 8 : 6,
          })
        : k,
    );
  return withProps(work, {}, kids);
}

function styleMenu(menu: BuilderNode, style: MaisonV2DemoStyle): BuilderNode {
  return mapTree(menu, (n) =>
    n.kind === "services_catalog"
      ? withProps(n, {
          showPhoto: style.menu.thumbnails,
          stylePreset: style.menu.thumbnails ? "image_led" : "clean",
          categoryNav: style.menu.categoryNav,
          columns: style.menu.columns,
        })
      : n,
  );
}

function styleAbout(about: BuilderNode, media: MediaUrls): BuilderNode {
  // The about portrait shows the talent at work in her space (her hero shot).
  if (!media.hero) return about;
  return mapTree(about, (n) => (n.kind === "image" && label(n) === "About portrait" ? withProps(n, { src: media.hero }) : n));
}

function styleFooter(node: BuilderNode, style: MaisonV2DemoStyle): BuilderNode {
  if (propsOf(node).slotKey !== "footer" || node.kind !== "container") return node;
  const tone =
    style.footer === "ink"
      ? { backgroundColor: "token:color.ink", textColor: "token:color.background" }
      : { backgroundColor: "token:color.surface-raised", textColor: "token:color.ink" };
  return withProps(node, { style: { ...styleOf(node), ...tone } });
}

function styleTrees(
  built: { shellTree: BuilderNode[]; homeTree: BuilderNode[] },
  style: MaisonV2DemoStyle,
  media: MediaUrls,
  code: string,
): { shellTree: BuilderNode[]; homeTree: BuilderNode[] } {
  const byLabel = new Map(built.homeTree.map((n) => [label(n) ?? "", n]));
  const hero = byLabel.get("Hero");
  if (!hero) throw new Error(`${code}: design tree has no Hero`);
  const wanted = new Set(Object.values(MAISON_V2_SECTION_LABELS));
  const ordered = style.order.map((key) => {
    const n = byLabel.get(MAISON_V2_SECTION_LABELS[key]);
    if (!n) throw new Error(`${code}: design tree has no ${MAISON_V2_SECTION_LABELS[key]}`);
    if (key === "work") return styleWork(n, style);
    if (key === "menu") return styleMenu(n, style);
    if (key === "about" && style.hero.photo) return styleAbout(n, media);
    return n;
  });
  if (new Set(style.order).size !== wanted.size) throw new Error(`${code}: order must list all six sections once`);
  const rest = built.homeTree.filter((n) => n !== hero && !wanted.has(label(n) ?? ""));
  return {
    shellTree: built.shellTree.map((n) => styleFooter(n, style)),
    homeTree: [styleHero(hero, style, media, code), ...ordered, ...rest],
  };
}

function fontFamily(name: string): string {
  const meta = getGoogleFontMeta(name);
  if (!meta) throw new Error(`font ${name} is not in the Google Fonts catalogue`);
  return cssFamilyForGoogleFont(meta);
}

/** Look tokens (colours + fonts) and the custom_palette row value. */
function styleLook(style: MaisonV2DemoStyle, paletteKey: string, code: string) {
  const c = style.customPalette;
  const colours: Record<string, string> = c
    ? {
        "color.background": c.page,
        "color.surface-raised": c.section,
        "color.line": c.line,
        "color.ink": c.text,
        "color.muted": c.muted,
        "color.primary": c.accent,
        "color.primary-on": c.onAccent,
        "color.accent": c.accent,
        "color.blush": c.tint,
      }
    : (galleryPaletteLookTokens("maison-v2", paletteKey) ?? {});
  if (!colours["color.background"]) throw new Error(`${code}: no palette ${paletteKey}`);
  // Custom palettes only: the built-in gallery palettes are the design's own.
  for (const [fg, bg, min] of !c ? [] : [
    ["color.ink", "color.background", 4.5],
    ["color.primary-on", "color.primary", 4.5],
    ["color.muted", "color.background", 4.5],
  ] as const) {
    const r = contrastRatio(colours[fg]!, colours[bg]!);
    if (r === null || r < min) throw new Error(`${code}: ${fg} on ${bg} contrast ${r?.toFixed(2)} < ${min}`);
  }
  const look = {
    ...colours,
    "typography.heading-font-family": fontFamily(style.fonts.heading),
    "typography.body-font-family": fontFamily(style.fonts.body),
  };
  const customPalette = c
    ? {
        name: c.name,
        fields: { page: c.page, text: c.text, accent: c.accent, section: c.section },
        derived: { rule: c.line, on_accent: c.onAccent },
      }
    : null;
  return { look, customPalette, lookSlug: c ? null : paletteKey };
}

async function loadMedia(client: SupabaseClient, talentProfileId: string): Promise<MediaUrls> {
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

async function ensureGuideServices(code: string, talentProfileId: string): Promise<string | null> {
  const extra = GUIDE_EXTRA_SERVICES[code];
  if (!extra) return null;
  const { data: offers, error } = await admin
    .from("talent_offerings")
    .select("*")
    .eq("talent_profile_id", talentProfileId)
    .order("sort_order");
  if (error) throw error;
  const list = offers ?? [];
  if (list.some((o) => o.title === extra.row.title)) return null;
  const anchor = list.find((o) => o.title === extra.after);
  if (!anchor) throw new Error(`${code}: guide anchor service ${extra.after} missing`);
  const at = (anchor.sort_order as number) + 1;
  const note = `add service "${String(extra.row.title)}" at #${at} (guide batch-1.json)`;
  if (!write) return note;
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, `${code}-offerings-${stamp}.json`),
    JSON.stringify({ profileCode: code, takenAt: new Date().toISOString(), talent_offerings: list }, null, 2),
  );
  for (const o of list.filter((x) => (x.sort_order as number) >= at).reverse()) {
    const { error: e } = await admin
      .from("talent_offerings")
      .update({ sort_order: (o.sort_order as number) + 1 })
      .eq("id", o.id);
    if (e) throw e;
  }
  const now = new Date().toISOString();
  const { data: ins, error: insErr } = await admin
    .from("talent_offerings")
    .insert({
      talent_profile_id: talentProfileId,
      tenant_id: anchor.tenant_id,
      kind: "service",
      price_type: anchor.price_type,
      reserve_mode: anchor.reserve_mode,
      allow_pay_in_person: anchor.allow_pay_in_person,
      status: "published",
      visibility: "public",
      moderation_state: "approved",
      is_featured: false,
      owner_kind: "talent",
      first_published_at: now,
      attributes: anchor.attributes,
      sort_order: at,
      ...extra.row,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  // A photo like her other services (her own gallery; one no service uses yet).
  const { data: used } = await admin
    .from("talent_offering_media")
    .select("media_asset_id")
    .in("offering_id", list.map((o) => o.id));
  const usedIds = new Set((used ?? []).map((u) => u.media_asset_id as string));
  const { data: gal } = await admin
    .from("media_assets")
    .select("id")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order");
  const free = (gal ?? []).find((g) => !usedIds.has(g.id as string));
  if (free) {
    const { error: mErr } = await admin
      .from("talent_offering_media")
      .insert({ offering_id: ins.id, media_asset_id: free.id, sort_order: 0 });
    if (mErr) throw mErr;
  }
  return note;
}

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
  const style = demo.design === "maison-v2" ? MAISON_V2_DEMO_STYLES[demo.profileCode] : undefined;
  const catalogLook = demo.design === "folio" ? await loadMaisonCatalogRow(admin, "look", `folio-${demo.palette}`) : null;
  const styled = style ? styleLook(style, demo.palette, demo.profileCode) : null;
  const galleryTokens = catalogLook ? null : (styled?.look ?? galleryPaletteLookTokens(demo.design, demo.palette));
  const lookSlug = catalogLook?.slug ?? (styled ? styled.lookSlug : demo.palette);

  // What the site should be: the same pure build applyDesign runs, then the style.
  const tokens = await loadTemplateHydrationTokens(tp.id as string);
  if (!tokens) throw new Error(`${demo.profileCode}: hydration tokens unavailable`);
  const built = buildDesignTrees(design.payload, tokens, undefined, { design: design.slug, version: design.version });
  if (!built.ok) throw new Error(`${demo.profileCode}: build failed ${built.errors.join("; ")}`);
  const trees = style
    ? styleTrees(built, style, await loadMedia(admin, tp.id as string), demo.profileCode)
    : { shellTree: built.shellTree, homeTree: built.homeTree };
  const nextTokens = {
    ...mergeLookIntoTokens(
      (site.design_tokens_draft as Record<string, string> | null) ?? {},
      catalogLook ? catalogLook.payload.tokens : galleryTokens!,
    ),
    ...(style?.tokens ?? {}),
  };
  const nextCustom = styled?.customPalette ?? null;
  const draftSame =
    site.theme_design_slug === demo.design &&
    site.theme_design_version === design.version &&
    (site.theme_look_slug ?? null) === lookSlug &&
    stable(site.custom_palette ?? null) === stable(nextCustom) &&
    stable(site.shell_tree) === stable(trees.shellTree) &&
    stable(home.blocks) === stable(trees.homeTree) &&
    stable(site.design_tokens_draft) === stable(nextTokens);
  const publishSame =
    !demo.live || !style ||
    (stable(site.shell_published) === stable(trees.shellTree) &&
      stable(home.blocks_published) === stable(trees.homeTree) &&
      stable(site.design_tokens) === stable(nextTokens));

  const serviceNote = await ensureGuideServices(demo.profileCode, tp.id as string);
  const tag = `${demo.profileCode} ${tp.display_name} → ${demo.design}/${lookSlug ?? `custom:${style?.customPalette?.name.en}`} ${demo.live ? (style ? "(LIVE: draft + publish)" : "(LIVE: draft only)") : "(unpublished)"}`;
  const summary = style
    ? ` fonts ${style.fonts.heading}/${style.fonts.body}; hero ${style.hero.media}; ticker ${style.ticker ? "on" : "off"}; portfolio ${style.portfolio.layout}; menu ${style.menu.thumbnails ? "thumbs" : "no-thumbs"}/${style.menu.categoryNav}/${style.menu.columns}col; footer ${style.footer}; order ${style.order.join(">")}`
    : "";
  if (serviceNote) console.log(write ? "wrote" : "[dry] would", serviceNote, demo.profileCode);
  if (draftSame && publishSame) {
    console.log("unchanged", tag);
    continue;
  }
  if (!write) {
    console.log(
      "[dry] would write",
      tag,
      draftSame ? "(draft same, publish only)" : "",
      `home ${trees.homeTree.length} sections, shell ${trees.shellTree.length};${summary}`,
    );
    continue;
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${demo.profileCode}-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify({ profileCode: demo.profileCode, email, takenAt: new Date().toISOString(), talent_sites: site, talent_pages: pages }, null, 2),
  );

  if (!draftSame) {
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
    const now = new Date().toISOString();
    const { error } = await admin
      .from("talent_sites")
      .update({
        ...(galleryTokens ? { design_tokens_draft: nextTokens, theme_look_slug: lookSlug } : {}),
        ...(style ? { shell_tree: trees.shellTree } : {}),
        custom_palette: nextCustom,
        pending_design: null,
        draft_updated_at: now,
        updated_at: now,
      })
      .eq("id", site.id)
      .eq("talent_profile_id", tp.id);
    if (error) throw error;
    if (style) {
      const { error: hErr } = await admin
        .from("talent_pages")
        .update({ blocks: trees.homeTree, updated_at: now })
        .eq("id", home.id)
        .eq("talent_profile_id", tp.id);
      if (hErr) throw hErr;
    }
  }

  if (demo.live && style) {
    const now = new Date().toISOString();
    const pub = await publishTalentPageBodies(admin, { talentProfileId: tp.id as string, now });
    if (!pub.ok) throw new Error(`${demo.profileCode} publish pages failed`);
    const { data: fresh } = await admin.from("talent_sites").select("shell_tree").eq("id", site.id).single();
    const { error: pubErr } = await admin
      .from("talent_sites")
      .update({
        shell_published: fresh?.shell_tree ?? [],
        site_published_at: now,
        status: "published",
        published_at: now,
        updated_at: now,
        updated_by: tp.user_id,
      })
      .eq("id", site.id);
    if (pubErr) throw pubErr;
    const t = await publishSiteTheme(admin, { siteId: site.id as string, profileCode: demo.profileCode });
    if (!t.ok) throw new Error(`${demo.profileCode} publishSiteTheme: ${t.error}`);
  }
  console.log("wrote", tag, demo.live && style ? "and published" : "", "backup", backupFile, summary);
}
console.log(write ? "done" : "dry run done (pass --yes-write to apply)");
