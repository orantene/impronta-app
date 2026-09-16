/**
 * composeSiteFromBrief — the one door the onboarding designer calls.
 *
 *   composeSiteFromBrief({ tenantId, briefId?, lookId?, publish? })
 *     → { outcome: "composed" | "fallback_used" | "missing_logo" | "failed", … }
 *
 * Composes Look (Layer 1) + business components for the type (Layer 2) +
 * brief facts + owner media + lifestyle stock (Layer 3) into six page trees
 * and a shell, runs ONE bounded copy pass, validates every tree with
 * `validateBuilderNodeTree`, and writes drafts: `cms_pages` rows, the site
 * shell, the theme draft and the header nav. `publish: true` publishes the
 * same set (used by provisioning so a page-less tenant never renders blank).
 *
 * Never invents a fact (docs/plans/ai-composer-brief-contract.md §2): a
 * missing hours fact means no hours line; a missing WhatsApp means no
 * WhatsApp button; copy from the model is screened (`copy-pass.ts`) and any
 * line that smuggles a number is dropped, not repaired.
 *
 * Every write is idempotent by slug and never overwrites a page a human has
 * edited unless `overwrite: true` (contract §4). Usage rows carry
 * `context_jsonb.site_compose_id` so cost per site is one GROUP BY away.
 */

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/i18n/config";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { isResolvedAiChatConfigured, resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { queryLifestyleStockForType } from "@/lib/media/platform-stock";
import { logServerError } from "@/lib/server/safe-error";
import { publishHomepage, saveHomepageDraftComposition } from "@/lib/site-admin/server/homepage";
import { ensureHomepageRow } from "@/lib/site-admin/server/homepage";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";
import { validateThemePatch } from "@/lib/site-admin/tokens/registry";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadBriefForTenant } from "@/lib/tulala/brief-store-tenant.server";
import { confirmedFacts, listFact, numberFact, redactFactsForPrompt, stringFact, type Brief } from "@/lib/tulala/brief-store";
import { BUSINESS_TYPES, businessTypeById, searchBusinessTypes, type BusinessFamilyId } from "@/lib/words/business-types";

import { buildComponentsForType } from "./business-components";
import { buildCopyPassPrompt, COPY_PASS_JSON_SCHEMA, COPY_PASS_KEYS, COPY_PASS_MAX_TOKENS, COPY_PASS_TIMEOUT_MS, screenCopyReply, type CopyPassFacts } from "./copy-pass";
import { buildImageResolver, type CandidateImage } from "./image-resolver";
import { instantiateSite } from "./instantiate-site";
import { DEFAULT_LOOK_BY_FAMILY } from "./look-defaults";
import { LOOKS } from "./looks";
import { loadLookBySlug } from "./site-looks.server";
import { resolveTenantBusinessType } from "./tenant-business-type";
import { themePatchFromPalette } from "./theme-from-palette";
import { SITE_PAGE_ROLES, type Bilingual, type Look, type SiteIdentity, type SiteLocale, type SitePageRole } from "./types";
import { writeFreeformSiteShell } from "./write-site-shell.server";

export type ComposeOutcome = "composed" | "fallback_used" | "missing_logo" | "failed";

export interface ComposeSiteInput {
  tenantId: string;
  briefId?: string | null;
  lookId?: string | null;
  locale?: SiteLocale;
  actorProfileId?: string | null;
  /** Publish the set instead of leaving drafts (provisioning uses true). */
  publish?: boolean;
  /** Replace pages that already exist for these slugs. Default false. */
  overwrite?: boolean;
}

export interface ComposeSiteResult {
  outcome: ComposeOutcome;
  siteComposeId: string;
  lookId: string;
  typeId: string;
  family: BusinessFamilyId;
  pageIds: Partial<Record<SitePageRole, string>>;
  shellPageId: string | null;
  copySource: "model" | "defaults";
  imagePicks: { owner: number; stock: number; none: number };
  /** Everything that made this less than `composed`, in plain words. */
  notes: string[];
  costUsd: number;
  durationMs: number;
}

/** Public slugs per family: the catalogue is what the type sells. */
function pageHrefsFor(family: BusinessFamilyId): Record<SitePageRole, string> {
  const catalogue = family === "dining" ? "/menu" : family === "fitness" || family === "education" ? "/clases" : family === "events" || family === "hospitality" ? "/espacios" : family === "tours" ? "/tours" : "/servicios";
  const transaction = family === "dining" || family === "events" || family === "hospitality" ? "/reservar" : "/agendar";
  return { home: "/", catalogue, transaction, about: "/nosotros", contact: "/contacto", gallery: "/galeria" };
}

/** First non-empty string; an empty identity column is "missing", not a value. */
function pick(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

function normalizeHandle(raw: string | null | undefined, base: string): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^@/, "")}`;
}

async function raceWithTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadOwnerImages(admin: SupabaseClient, tenantId: string): Promise<CandidateImage[]> {
  const { data, error } = await admin
    .from("media_assets")
    .select("storage_path, bucket_id, width, height, alt, owner_talent_profile_id, ownership_kind, purpose")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .is("owner_talent_profile_id", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    logServerError("compose.ownerImages", error);
    return [];
  }
  return ((data ?? []) as Array<{ storage_path: string | null; bucket_id: string | null; width: number | null; height: number | null; alt: string | null }>)
    .filter((r) => !!r.storage_path)
    .map((r) => ({
      src: admin.storage.from(r.bucket_id ?? "media-public").getPublicUrl(r.storage_path as string).data.publicUrl,
      width: r.width,
      height: r.height,
      alt: { es: r.alt ?? "", en: r.alt ?? "" },
      owner: true,
    }));
}

async function resolveLogoUrl(admin: SupabaseClient, tenantId: string, brief: Brief | null): Promise<string | null> {
  const fromBrief = brief ? stringFact(brief, "brand.logo_url") : null;
  if (fromBrief && /^https?:\/\//i.test(fromBrief)) return fromBrief;
  const { data, error } = await admin.from("agency_branding").select("logo_media_asset_id").eq("tenant_id", tenantId).maybeSingle<{ logo_media_asset_id: string | null }>();
  if (error || !data?.logo_media_asset_id) return null;
  const { data: asset, error: assetErr } = await admin.from("media_assets").select("storage_path, bucket_id").eq("id", data.logo_media_asset_id).maybeSingle<{ storage_path: string | null; bucket_id: string | null }>();
  if (assetErr || !asset?.storage_path) return null;
  return admin.storage.from(asset.bucket_id ?? "media-public").getPublicUrl(asset.storage_path).data.publicUrl;
}

async function upsertFreeformPage(
  admin: SupabaseClient,
  input: { tenantId: string; locale: string; slug: string; title: string; tree: unknown[]; publish: boolean; overwrite: boolean; actorProfileId: string | null; role: SitePageRole },
): Promise<{ ok: true; pageId: string; action: "created" | "updated" | "kept" } | { ok: false; error: string }> {
  const { data: existing, error: readErr } = await admin
    .from("cms_pages")
    .select("id, updated_at, created_at, status")
    .eq("tenant_id", input.tenantId)
    .eq("locale", input.locale)
    .eq("slug", input.slug)
    .neq("status", "archived")
    .maybeSingle<{ id: string; updated_at: string; created_at: string; status: string }>();
  if (readErr) return { ok: false, error: readErr.message };
  const nowIso = new Date().toISOString();
  if (existing) {
    // A page edited after creation is a human's; only `overwrite` may touch it.
    const edited = new Date(existing.updated_at).getTime() - new Date(existing.created_at).getTime() > 5_000;
    if (edited && !input.overwrite) return { ok: true, pageId: existing.id, action: "kept" };
    const { error } = await admin
      .from("cms_pages")
      .update({ title: input.title, is_freeform: true, blocks: input.tree, ...(input.publish ? { status: "published", published_at: nowIso } : {}), updated_at: nowIso, updated_by: input.actorProfileId })
      .eq("id", existing.id)
      .eq("tenant_id", input.tenantId);
    return error ? { ok: false, error: error.message } : { ok: true, pageId: existing.id, action: "updated" };
  }
  const { data: page, error } = await admin
    .from("cms_pages")
    .insert({
      tenant_id: input.tenantId,
      locale: input.locale,
      slug: input.slug,
      template_key: "standard_page",
      template_schema_version: 1,
      title: input.title,
      is_freeform: true,
      blocks: input.tree,
      status: input.publish ? "published" : "draft",
      ...(input.publish ? { published_at: nowIso } : {}),
      is_system_owned: false,
      version: 1,
      created_by: input.actorProfileId,
      updated_by: input.actorProfileId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !page) return { ok: false, error: error?.message ?? "insert failed" };
  return { ok: true, pageId: page.id, action: "created" };
}

async function ensureNav(admin: SupabaseClient, input: { tenantId: string; locale: string; items: Array<{ label: string; href: string }> }): Promise<void> {
  const { data: existing, error } = await admin.from("cms_navigation_items").select("id").eq("tenant_id", input.tenantId).eq("zone", "header").limit(1);
  if (error || (existing && existing.length > 0)) return;
  await admin.from("cms_navigation_items").insert(input.items.map((it, i) => ({ tenant_id: input.tenantId, locale: input.locale, zone: "header", label: it.label, href: it.href, sort_order: i, visible: true })));
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function composeSiteFromBrief(input: ComposeSiteInput): Promise<ComposeSiteResult> {
  const started = Date.now();
  const siteComposeId = randomUUID();
  const notes: string[] = [];
  const fail = (why: string, partial: Partial<ComposeSiteResult> = {}): ComposeSiteResult => ({
    outcome: "failed",
    siteComposeId,
    lookId: partial.lookId ?? "",
    typeId: partial.typeId ?? "custom",
    family: partial.family ?? "custom",
    pageIds: partial.pageIds ?? {},
    shellPageId: partial.shellPageId ?? null,
    copySource: partial.copySource ?? "defaults",
    imagePicks: partial.imagePicks ?? { owner: 0, stock: 0, none: 0 },
    notes: [...notes, why],
    costUsd: 0,
    durationMs: Date.now() - started,
  });

  const admin = createServiceRoleClient();
  if (!admin) return fail("service role client unavailable");

  // 1. Who is this business.
  const { data: agency, error: agencyErr } = await admin.from("agencies").select("id, slug, display_name, settings, workspace_type, supported_locales").eq("id", input.tenantId).maybeSingle<{ id: string; slug: string; display_name: string | null; settings: unknown; workspace_type: string | null; supported_locales: string[] | null }>();
  if (agencyErr || !agency) return fail(`tenant not found: ${agencyErr?.message ?? input.tenantId}`);
  const identityRow = await loadIdentityForStaff(admin, input.tenantId);
  // The site is written in the tenant's own default locale: a home written in
  // a locale the storefront never requests is a home nobody sees.
  const tenantLocale = identityRow?.default_locale ?? agency.supported_locales?.[0] ?? null;
  const locale: SiteLocale = input.locale ?? (tenantLocale === "en" ? "en" : "es");
  if (!input.locale) notes.push(`locale ${locale} (tenant default ${tenantLocale ?? "unset"})`);
  const brief = await loadBriefForTenant({ tenantId: input.tenantId, briefId: input.briefId ?? null });
  if (!brief) notes.push("no brief stamped on this tenant; identity and settings only");
  const facts = brief;
  if (brief && confirmedFacts(brief).length === 0) notes.push("no confirmed facts; unapproved facts used at the composer's discretion (contract §1)");
  // Only what redaction lets a prompt see may reach the copy pass.
  const promptVisible = new Set(brief ? redactFactsForPrompt(brief.facts).map((f) => f.factKey) : []);
  const visible = (key: string): string | null => (facts && promptVisible.has(key) ? stringFact(facts, key) : null);

  // 2. Business type: the brief's industry, else what the workspace records.
  let typeId = "custom";
  let family: BusinessFamilyId = "custom";
  const industry = facts ? stringFact(facts, "work.industry") : null;
  const fromSettings = resolveTenantBusinessType(agency.settings);
  if (fromSettings.source === "business_type_id") {
    typeId = fromSettings.typeId;
    family = fromSettings.family;
  } else if (industry) {
    const hit = searchBusinessTypes(industry)[0] ?? null;
    if (hit) {
      typeId = hit.id;
      family = hit.family;
    } else {
      notes.push(`industry "${industry}" matched no business type`);
    }
  }
  if (typeId === "custom" && fromSettings.source !== "default") {
    typeId = fromSettings.typeId;
    family = fromSettings.family;
  }
  const typeRow = businessTypeById(typeId) ?? BUSINESS_TYPES.find((t) => t.id === "custom");

  // 3. Look.
  const wantedLook = input.lookId ?? DEFAULT_LOOK_BY_FAMILY[family];
  const look: Look | null = (await loadLookBySlug(admin, wantedLook)) ?? LOOKS[0];
  if (look.id !== wantedLook) notes.push(`look "${wantedLook}" not found; used ${look.id}`);

  // 4. Identity (facts first, then the identity row, then the agency row).
  const businessName = (facts ? stringFact(facts, "business.name") : null)?.trim() || identityRow?.public_name?.trim() || agency.display_name?.trim() || agency.slug;
  const logoUrl = await resolveLogoUrl(admin, input.tenantId, facts);
  const hrefs = pageHrefsFor(family);
  const identity: SiteIdentity = {
    businessName,
    tagline: pick(identityRow?.tagline),
    city: pick(identityRow?.address_city, facts ? stringFact(facts, "business.works_from") : null),
    whatsapp: pick(facts ? stringFact(facts, "presence.whatsapp") : null, identityRow?.whatsapp),
    instagram: normalizeHandle(pick(facts ? stringFact(facts, "presence.instagram_handle") : null, identityRow?.social_instagram), "https://instagram.com/"),
    facebook: normalizeHandle(pick(facts ? stringFact(facts, "presence.facebook_url") : null, identityRow?.social_facebook), "https://facebook.com/"),
    hours: facts ? listFact(facts, "business.hours") : null,
    logoUrl,
    pageHrefs: hrefs,
  };

  // 5. Theme: the Look's patch, recoloured from the owner's palette when given.
  const palette = facts ? listFact(facts, "brand.palette") : [];
  const paletteResult = themePatchFromPalette(look.themePatch, palette);
  const themeGate = validateThemePatch({ ...paletteResult.patch });
  const themePatch = themeGate.normalized;
  if (paletteResult.demoted.length > 0) notes.push(`palette demoted: ${paletteResult.demoted.join(", ")}`);

  // 6. Images: owner media, then stock for the type.
  const [owner, stock] = await Promise.all([loadOwnerImages(admin, input.tenantId), queryLifestyleStockForType(admin, { businessType: typeId, family })]);
  const { resolve: images, picks } = buildImageResolver([
    ...owner,
    ...stock.map<CandidateImage>((s) => ({ src: s.url, width: s.width, height: s.height, alt: s.alt, role: s.role, owner: false })),
  ]);
  if (stock.length === 0 && owner.length === 0) notes.push("no owner media and no stock for this type");

  // 7. Components from facts.
  const components = buildComponentsForType(typeId, {
    locale,
    family,
    typeId,
    identity,
    images,
    services: facts ? listFact(facts, "work.services") : null,
    staffCount: facts ? numberFact(facts, "business.staff_count") : null,
    yearsExperience: facts ? numberFact(facts, "work.years_experience") : null,
    rosterActive: family === "agency",
  });

  // 8. One bounded copy pass.
  let copyOverrides: Record<string, Bilingual> = {};
  let copySource: ComposeSiteResult["copySource"] = "defaults";
  try {
    const configured = await isResolvedAiChatConfigured();
    const gate = configured ? await assertAiInvocationAllowed(input.tenantId) : { ok: false as const };
    if (configured && gate.ok) {
      const copyFacts: CopyPassFacts = {
        businessName,
        city: identity.city,
        tagline: identity.tagline,
        familyLabel: family,
        typeLabel: typeRow ? typeRow.label : { es: typeId, en: typeId },
        audience: visible("brand.audience"),
        tone: visible("brand.tone"),
        differentiator: visible("brand.differentiator"),
        description: visible("business.description"),
        services: facts && promptVisible.has("work.services") ? listFact(facts, "work.services") : [],
      };
      const prompt = buildCopyPassPrompt({ facts: copyFacts, defaults: look.copy, keys: COPY_PASS_KEYS, primaryLocale: locale });
      const adapter = await resolveAiChatAdapter();
      const t0 = Date.now();
      const pending = adapter.chatCompletion({ ...prompt, jsonSchema: COPY_PASS_JSON_SCHEMA, maxTokens: COPY_PASS_MAX_TOKENS, model: "claude-sonnet-5" });
      const result = await raceWithTimeout(pending, COPY_PASS_TIMEOUT_MS);
      // The provider call keeps running after a timeout and still costs money:
      // record its usage when it lands, flagged, so the per-site cost is honest.
      void pending
        .then((r) =>
          recordAiGenerationUsage({
            provider: adapter.id,
            model: r.ok ? (r.model ?? "claude-sonnet-5") : "claude-sonnet-5",
            usage: r.ok ? r.usage : undefined,
            actorProfileId: input.actorProfileId ?? null,
            ok: r.ok,
            scope: "site_compose_copy",
            latencyMs: Date.now() - t0,
            tenantId: input.tenantId,
            context: { site_compose_id: siteComposeId, look: look.id, business_type: typeId, timed_out: result === null, used: result !== null && r.ok },
          }),
        )
        .catch((err) => logServerError("compose.copyPass.usage", err));
      if (result?.ok) {
        const screened = screenCopyReply(result.text, { facts: copyFacts, defaults: look.copy, keys: COPY_PASS_KEYS, primaryLocale: locale });
        copyOverrides = screened.copy;
        copySource = Object.keys(copyOverrides).length > 0 ? "model" : "defaults";
        if (screened.dropped.length > 0) notes.push(`copy lines dropped: ${screened.dropped.map((d) => `${d.key} (${d.reason})`).join(", ")}`);
      } else {
        notes.push(result === null ? "copy pass timed out; defaults used" : "copy pass failed; defaults used");
      }
    } else {
      notes.push(configured ? "AI not allowed for this tenant; defaults used" : "AI provider not configured; defaults used");
    }
  } catch (error) {
    logServerError("compose.copyPass", error);
    notes.push("copy pass threw; defaults used");
  }

  // 9. Instantiate + validate.
  const site = instantiateSite({ look, locale, identity, images, components, copyOverrides });
  const validatorIssues = site.issues.filter((i) => !/image slot .* unresolved/.test(i));
  if (validatorIssues.length > 0) return fail(`validator: ${validatorIssues.slice(0, 5).join("; ")}`, { lookId: look.id, typeId, family });
  for (const issue of site.issues) notes.push(issue);

  // 10. Write.
  const writeLocale = locale as Locale;
  const pageIds: Partial<Record<SitePageRole, string>> = {};

  const { error: themeErr } = await admin.from("agency_branding").upsert({ tenant_id: input.tenantId, theme_json_draft: themePatch, ...(input.publish ? { theme_json: themePatch } : {}) } as never, { onConflict: "tenant_id" });
  if (themeErr) notes.push(`theme draft not written: ${themeErr.message}`);

  const home = await ensureHomepageRow(admin, { tenantId: input.tenantId, locale: writeLocale });
  if (!home.ok) return fail(`homepage row: ${home.code ?? "ensure failed"}`, { lookId: look.id, typeId, family });
  const saved = await saveHomepageDraftComposition(admin, {
    tenantId: input.tenantId,
    values: {
      tenantId: input.tenantId,
      locale: writeLocale,
      expectedVersion: home.data.version,
      metadata: { title: businessName, metaDescription: undefined, introTagline: undefined, ogTitle: undefined, ogDescription: undefined, ogImageUrl: undefined, canonicalUrl: undefined, noindex: false },
      slots: {},
      builderTree: site.pages.home,
    },
    actorProfileId: input.actorProfileId ?? null,
  });
  if (!saved.ok) return fail(`home draft: ${saved.code ?? "save failed"}`, { lookId: look.id, typeId, family });
  pageIds.home = home.data.id;
  if (input.publish) {
    const pub = await publishHomepage(admin, { tenantId: input.tenantId, values: { tenantId: input.tenantId, locale: writeLocale, expectedVersion: saved.data.version }, actorProfileId: input.actorProfileId ?? null });
    if (!pub.ok) notes.push(`home publish: ${pub.code ?? "failed"}`);
  }

  const titles: Record<Exclude<SitePageRole, "home">, Bilingual> = {
    catalogue: look.copy["nav.catalogue"],
    transaction: look.copy["nav.transaction"],
    about: look.copy["nav.about"],
    contact: look.copy["nav.contact"],
    gallery: look.copy["nav.gallery"],
  };
  for (const role of SITE_PAGE_ROLES) {
    if (role === "home") continue;
    const res = await upsertFreeformPage(admin, {
      tenantId: input.tenantId,
      locale,
      slug: hrefs[role].replace(/^\//, ""),
      title: titles[role][locale],
      tree: site.pages[role],
      publish: !!input.publish,
      overwrite: !!input.overwrite,
      actorProfileId: input.actorProfileId ?? null,
      role,
    });
    if (!res.ok) return fail(`${role} page: ${res.error}`, { lookId: look.id, typeId, family, pageIds });
    pageIds[role] = res.pageId;
    if (res.action === "kept") notes.push(`${role} page kept (edited by a person)`);
  }

  const shell = await writeFreeformSiteShell(admin, { tenantId: input.tenantId, locale: writeLocale, actorProfileId: input.actorProfileId ?? null, businessName, header: site.shell.header, footer: site.shell.footer, publish: !!input.publish, overwrite: !!input.overwrite });
  if (!shell.ok) notes.push(`shell: ${shell.error}`);

  await ensureNav(admin, {
    tenantId: input.tenantId,
    locale,
    items: (["catalogue", "transaction", "about", "gallery", "contact"] as const).map((r) => ({ label: titles[r][locale], href: hrefs[r] })),
  });

  // 11. Cost for this compose (success and failure rows both carry the id).
  let costUsd = 0;
  try {
    const { data: usage } = await admin.from("cms_ai_usage_log").select("context_jsonb").eq("tenant_id", input.tenantId).contains("context_jsonb", { site_compose_id: siteComposeId });
    for (const row of (usage ?? []) as Array<{ context_jsonb: { cost_usd?: number } | null }>) costUsd += Number(row.context_jsonb?.cost_usd ?? 0);
  } catch {
    /* cost is informational */
  }

  const imagePicks = { owner: picks.filter((p) => p.source === "owner").length, stock: picks.filter((p) => p.source === "stock").length, none: picks.filter((p) => p.source === "none").length };
  const degraded = !brief || copySource === "defaults" || imagePicks.none > 0 || !shell.ok;
  const outcome: ComposeOutcome = degraded ? "fallback_used" : !logoUrl ? "missing_logo" : "composed";
  if (!logoUrl) notes.push("no logo; the wordmark carries the header");

  return { outcome, siteComposeId, lookId: look.id, typeId, family, pageIds, shellPageId: shell.ok ? shell.pageId : null, copySource, imagePicks, notes, costUsd, durationMs: Date.now() - started };
}
