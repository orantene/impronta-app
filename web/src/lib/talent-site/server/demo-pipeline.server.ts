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
import { isDemoAccount } from "@/lib/talent-site/theme-catalog/demo-account";
import { MAISON_V2_DEMO_STYLES, THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import { syncBuiltinTalentThemes } from "@/lib/talent-site/theme-catalog/sync-builtins.server";
import { loadTemplateHydrationTokens } from "./apply-template-core";
import { loadDemoRows, loadMedia, planDemoDesign, writeDemoDraft } from "@/lib/talent-site/demos/design-step.server";
import { publishTalentPageBodies } from "./publish-talent-page-bodies";
import { requestTalentSiteRevalidate } from "./revalidate-request.server";
import { demoStyleTokens, styleTrees } from "@/lib/talent-site/theme-catalog/demo-style-build";
import { applyDesign, buildDesignTrees, publishSiteTheme } from "./theme-apply-core";

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

export interface DemoPipelineCtx {
  admin: SupabaseClient;
  write: boolean;
  stamp: string;
  backup?: (fileName: string, json: string) => void;
}

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


export async function ensureGuideServices(ctx: DemoPipelineCtx, code: string, talentProfileId: string): Promise<string | null> {
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
  /** `skipHttpBust`: the caller busts the cache itself (inside Next, `bustTalentSiteCache`). */
  opts: { skipHttpBust?: boolean } = {},
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
  if (opts.skipHttpBust) return { revalidated: false };
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
  const ctx: DemoPipelineCtx = { admin, write, stamp, ...(opts.backup ? { backup: opts.backup } : {}) };
  const results: DemoPipelineResult[] = [];

  if (opts.syncCatalog) {
    if (!write) log("[dry] would run syncBuiltinTalentThemes");
    else log(`catalog sync ${JSON.stringify(await syncBuiltinTalentThemes(admin, null))}`);
  }

  const targets = THEME_DEMOS.filter((d) => !only || only.includes(d.profileCode));
  if (only && targets.length !== only.length) throw new Error("--only has codes not in THEME_DEMOS");

  for (const demo of targets) {
    const rows = await loadDemoRows(admin, demo.profileCode);
    const { tp, site, pages, email } = rows;
    if (!isDemoAccount(email, rows.demoBatch)) {
      throw new Error(`REFUSE: ${demo.profileCode} (${email}) is not a demo account`);
    }
    const isPublished = Array.isArray(site.shell_published) || !!site.site_published_at;
    if (demo.live && site.theme_design_slug !== demo.design) {
      throw new Error(
        `REFUSE: live demo ${demo.profileCode} wears ${site.theme_design_slug}, not ${demo.design}; switch it by hand`,
      );
    }
    if (!demo.live && isPublished) {
      throw new Error(`REFUSE: ${demo.profileCode} is published but listed as a new (unpublished) demo`);
    }

    const plan = await planDemoDesign(admin, demo, rows);
    const { style, trees, lookSlug, draftSame, publishSame } = plan;

    const serviceNote = await ensureGuideServices(ctx, demo.profileCode, tp.id);
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

    if (!draftSame) await writeDemoDraft(admin, demo, rows, plan);

    if (demo.live && style) {
      const pub = await publishDemoSite(admin, {
        siteId: site.id,
        talentProfileId: tp.id,
        profileCode: demo.profileCode,
        userId: tp.user_id,
      });
      if (pub.warning) log(`WARN ${pub.warning}`);
    }
    log(`wrote ${tag} ${demo.live && style ? "and published" : ""} backup ${backupFile} ${summary}`);
    results.push({ profileCode: demo.profileCode, status: "wrote" });
  }


  return results;
}

/**
 * Theme releases, "Publish to demos": re-apply the FULL design at its current
 * version to a demo that has no exact merge base (older pinned version with no
 * snapshot). The demo's own content is rebuilt into the design; its seeded
 * Maison v2 style (MAISON_V2_DEMO_STYLES) is layered on again where one exists,
 * and its look tokens are kept. Demo accounts only (callers select
 * `talent_profiles.is_demo = true`). Does not publish; the caller does.
 */
export async function reapplyDemoDesignAtVersion(
  admin: SupabaseClient,
  input: { siteId: string; talentProfileId: string; profileCode: string; userId: string; displayName: string },
  design: Parameters<typeof applyDesign>[1]["design"],
): Promise<void> {
  const d = await applyDesign(admin, {
    talentProfileId: input.talentProfileId,
    siteId: input.siteId,
    design,
    displayName: input.displayName,
    userId: input.userId,
    actor: "tulala",
  });
  if (!d.ok) throw new Error(`${input.profileCode} applyDesign: ${d.error}`);
  const style = design.slug === "maison-v2" ? MAISON_V2_DEMO_STYLES[input.profileCode] : undefined;
  if (!style) return;
  const tokens = await loadTemplateHydrationTokens(input.talentProfileId);
  if (!tokens) throw new Error(`${input.profileCode}: hydration tokens unavailable`);
  const built = buildDesignTrees(design.payload, tokens, undefined, { design: design.slug, version: design.version });
  if (!built.ok) throw new Error(`${input.profileCode}: build failed ${built.errors.join("; ")}`);
  const trees = styleTrees(built, style, await loadMedia(admin, input.talentProfileId), input.profileCode);
  const { data: site, error: sErr } = await admin
    .from("talent_sites")
    .select("design_tokens_draft")
    .eq("id", input.siteId)
    .single();
  if (sErr) throw sErr;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_sites")
    .update({
      shell_tree: trees.shellTree,
      design_tokens_draft: { ...((site?.design_tokens_draft as Record<string, string> | null) ?? {}), ...demoStyleTokens(style) },
      draft_updated_at: now,
      updated_at: now,
    })
    .eq("id", input.siteId)
    .eq("talent_profile_id", input.talentProfileId);
  if (error) throw error;
  const { error: hErr } = await admin
    .from("talent_pages")
    .update({ blocks: trees.homeTree, updated_at: now })
    .eq("talent_profile_id", input.talentProfileId)
    .eq("is_home", true);
  if (hErr) throw hErr;
}
