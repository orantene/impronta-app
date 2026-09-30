import "server-only";

/**
 * Demo-talent theme pipeline (server function). The core of
 * scripts/demo-talents/apply-theme-demos.mts, moved here so the script (CLI)
 * and Builder Lab share it. For each demo in THEME_DEMOS: apply the design's
 * section layout hydrated with the talent's OWN profile, services and photos
 * (`buildDesignTrees`, the builder's core), the demo's look as draft tokens,
 * and (Maison v2) the demo's distinct style from MAISON_V2_DEMO_STYLES. Live
 * demos get the draft rewritten AND published.
 *
 * Safety: every row is re-checked as a demo (profile code in THEME_DEMOS,
 * demo_batch user, demo email), never by `is_test_account`. Idempotent: a demo
 * that already matches is reported "unchanged". Backups are a caller callback
 * (the CLI writes files; a server action has no durable disk). Throws on the
 * first failing demo, as the script always did.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { galleryPaletteLookTokens, getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { mergeLookIntoTokens } from "@/lib/talent-site/theme-catalog/look-layer";
import { isDemoAccount } from "@/lib/talent-site/theme-catalog/demo-account";
import { styleLook, styleTrees, type MediaUrls } from "@/lib/talent-site/theme-catalog/demo-style-build";
import { MAISON_V2_DEMO_STYLES, THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import { syncBuiltinTalentThemes } from "@/lib/talent-site/theme-catalog/sync-builtins.server";
import { loadTemplateHydrationTokens } from "./apply-template-core";
import { loadMaisonCatalogRow } from "./maison-catalog-row";
import { publishTalentPageBodies } from "./publish-talent-page-bodies";
import { requestTalentSiteRevalidate } from "./revalidate-request.server";
import { applyDesign, applyLook, buildDesignTrees, publishSiteTheme } from "./theme-apply-core";

export interface DemoPipelineOptions {
  /** Restrict to these profile codes (must all be in THEME_DEMOS). */
  only?: string[];
  /** Default false: dry run (plans only). */
  write?: boolean;
  /** Also run syncBuiltinTalentThemes first (needs write). */
  syncCatalog?: boolean;
  backup?: (fileName: string, json: string) => void;
  log?: (line: string) => void;
}

export interface DemoPipelineResult {
  profileCode: string;
  status: "unchanged" | "would_write" | "wrote";
}

interface Ctx {
  admin: SupabaseClient;
  write: boolean;
  stamp: string;
  backup?: (fileName: string, json: string) => void;
}

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

async function ensureGuideServices(ctx: Ctx, code: string, talentProfileId: string): Promise<string | null> {
  const { admin, write, stamp } = ctx;
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
  ctx.backup?.(
    `${code}-offerings-${stamp}.json`,
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
  const { data: used, error: usedErr } = await admin
    .from("talent_offering_media")
    .select("media_asset_id")
    .in("offering_id", list.map((o) => o.id));
  if (usedErr) throw usedErr;
  const usedIds = new Set((used ?? []).map((u) => u.media_asset_id as string));
  const { data: gal, error: galErr } = await admin
    .from("media_assets")
    .select("id")
    .eq("owner_talent_profile_id", talentProfileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order");
  if (galErr) throw galErr;
  const free = (gal ?? []).find((g) => !usedIds.has(g.id as string));
  if (free) {
    const { error: mErr } = await admin
      .from("talent_offering_media")
      .insert({ offering_id: ins.id, media_asset_id: free.id, sort_order: 0 });
    if (mErr) throw mErr;
  }
  return note;
}


/**
 * Publish a LIVE demo's current draft (pages, shell, theme), then clear its
 * public page cache through a real request (this code runs outside a Next
 * request in the CLI, where revalidateTag cannot). Demo accounts only: callers
 * must have verified the account with `isDemoAccount`. Returns the cache-bust
 * outcome; a failed bust is a warning for the caller, the publish stands.
 */
export async function publishDemoSite(
  admin: SupabaseClient,
  input: { siteId: string; talentProfileId: string; profileCode: string; userId: string },
): Promise<{ revalidated: boolean; warning?: string }> {
  const now = new Date().toISOString();
  const pub = await publishTalentPageBodies(admin, { talentProfileId: input.talentProfileId, now });
  if (!pub.ok) throw new Error(`${input.profileCode} publish pages failed`);
  const { data: fresh, error: freshErr } = await admin
    .from("talent_sites")
    .select("shell_tree")
    .eq("id", input.siteId)
    .single();
  if (freshErr) throw freshErr;
  const { error: pubErr } = await admin
    .from("talent_sites")
    .update({
      shell_published: fresh?.shell_tree ?? [],
      site_published_at: now,
      status: "published",
      published_at: now,
      updated_at: now,
      updated_by: input.userId,
    })
    .eq("id", input.siteId);
  if (pubErr) throw pubErr;
  const t = await publishSiteTheme(admin, { siteId: input.siteId, profileCode: input.profileCode });
  if (!t.ok) throw new Error(`${input.profileCode} publishSiteTheme: ${t.error}`);
  const bust = await requestTalentSiteRevalidate({
    talentProfileId: input.talentProfileId,
    profileCode: input.profileCode,
  });
  return bust.ok
    ? { revalidated: true }
    : { revalidated: false, warning: `${input.profileCode}: cache not cleared (${bust.error})` };
}

export async function applyThemeDemos(
  admin: SupabaseClient,
  opts: DemoPipelineOptions = {},
): Promise<DemoPipelineResult[]> {
  const write = opts.write === true;
  const only = opts.only;
  const log = opts.log ?? (() => undefined);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ctx: Ctx = { admin, write, stamp, ...(opts.backup ? { backup: opts.backup } : {}) };
  const results: DemoPipelineResult[] = [];

  if (opts.syncCatalog) {
    if (!write) log("[dry] would run syncBuiltinTalentThemes");
    else log(`catalog sync ${JSON.stringify(await syncBuiltinTalentThemes(admin, null))}`);
  }

  const targets = THEME_DEMOS.filter((d) => !only || only.includes(d.profileCode));
  if (only && targets.length !== only.length) throw new Error("--only has codes not in THEME_DEMOS");

  for (const demo of targets) {
    const { data: tp, error: tpErr } = await admin
      .from("talent_profiles")
      .select("id, profile_code, user_id, display_name")
      .eq("profile_code", demo.profileCode)
      .is("deleted_at", null)
      .maybeSingle();
    if (tpErr) throw tpErr;
    if (!tp) throw new Error(`${demo.profileCode}: profile not found`);
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(tp.user_id as string);
    if (uErr) throw uErr;
    const email = u.user?.email ?? "";
    if (!isDemoAccount(email, u.user?.app_metadata?.demo_batch)) {
      throw new Error(`REFUSE: ${demo.profileCode} (${email}) is not a demo account`);
    }
    const { data: site, error: siteErr } = await admin
      .from("talent_sites")
      .select("*")
      .eq("talent_profile_id", tp.id)
      .maybeSingle();
    if (siteErr) throw siteErr;
    if (!site) throw new Error(`${demo.profileCode}: no site`);
    const { data: pages, error: pagesErr } = await admin
      .from("talent_pages")
      .select("*")
      .eq("talent_profile_id", tp.id);
    if (pagesErr) throw pagesErr;
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

    const serviceNote = await ensureGuideServices(ctx, demo.profileCode, tp.id as string);
    const tag = `${demo.profileCode} ${tp.display_name} → ${demo.design}/${lookSlug ?? `custom:${style?.customPalette?.name.en}`} ${demo.live ? (style ? "(LIVE: draft + publish)" : "(LIVE: draft only)") : "(unpublished)"}`;
    const summary = style
      ? ` fonts ${style.fonts.heading}/${style.fonts.body}; hero ${style.hero.media}; ticker ${style.ticker ? "on" : "off"}; portfolio ${style.portfolio.layout}; menu ${style.menu.thumbnails ? "thumbs" : "no-thumbs"}/${style.menu.categoryNav}/${style.menu.columns}col; footer ${style.footer}; order ${style.order.join(">")}`
      : "";
    if (serviceNote) log(`${write ? "wrote" : "[dry] would"} ${serviceNote} ${demo.profileCode}`);
    if (draftSame && publishSame) {
      log(`unchanged ${tag}`);
      results.push({ profileCode: demo.profileCode, status: "unchanged" });
      continue;
    }
    if (!write) {
      log(
        `[dry] would write ${tag} ${draftSame ? "(draft same, publish only)" : ""} home ${trees.homeTree.length} sections, shell ${trees.shellTree.length};${summary}`,
      );
      results.push({ profileCode: demo.profileCode, status: "would_write" });
      continue;
    }

    const backupFile = `${demo.profileCode}-${stamp}.json`;
    ctx.backup?.(
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
      const pub = await publishDemoSite(admin, {
        siteId: site.id as string,
        talentProfileId: tp.id as string,
        profileCode: demo.profileCode,
        userId: tp.user_id as string,
      });
      if (pub.warning) log(`WARN ${pub.warning}`);
    }
    log(`wrote ${tag} ${demo.live && style ? "and published" : ""} backup ${backupFile} ${summary}`);
    results.push({ profileCode: demo.profileCode, status: "wrote" });
  }


  return results;
}
