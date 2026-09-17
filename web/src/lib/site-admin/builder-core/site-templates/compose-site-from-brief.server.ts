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
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { resolveRoutedChat } from "@/lib/ai/call-routing.server";
import { buildCriticPrompt, checkHeadlineBank, CRITIC_JSON_SCHEMA, parseCriticReply, retryInstruction, type CriticVerdict } from "./copy-critic";
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
import { assignmentSourceForLevel, buildImageResolver, type AssignmentSource, type CandidateImage } from "./image-resolver";
import { stockFactsFromBrief } from "./stock-prompts";
import { writeAssignments } from "@/lib/media/asset-assignments.server";
import { tagFor, tenantBustTags } from "@/lib/site-admin/cache-tags";
import { updateTag } from "next/cache";
import { enqueueTenantImageJob } from "@/lib/media/tenant-image-jobs.server";
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
  /** What the arrival screen may claim (onboarding v3.2): only what was really placed. */
  placed: SiteComposePlaced;
  /** Everything that made this less than `composed`, in plain words. */
  notes: string[];
  costUsd: number;
  durationMs: number;
}

export type PlacedPhotoLevel = "owner" | "tenant" | "type" | "family" | "universal";

export interface SiteComposePlaced {
  /**
   * `hero` / `level` are pack levels (worst level across placed slots);
   * `heroSource` is the stored assignment's `source` for the home hero, which
   * is what onboarding's arrival copy reads (claims photos for `type_pool` or
   * better). `pendingJobId` is set when a per-site generation was enqueued.
   */
  photos: { hero: PlacedPhotoLevel | null; heroSource: AssignmentSource | null; gallery: number; level: PlacedPhotoLevel | null; pendingJobId: string | null };
  menuItems: number;
  hoursPresent: boolean;
  whatsappPresent: boolean;
  logoPresent: boolean;
}

/** The stamp written to `agencies.settings.site_compose` on every outcome. */
export interface SiteComposeStamp {
  outcome: ComposeOutcome;
  siteComposeId: string;
  lookId: string;
  typeId: string;
  family: string;
  at: string;
  pageIds: Partial<Record<SitePageRole, string>>;
  placed: SiteComposePlaced;
  copySource: "model" | "defaults";
  notes: string[];
  /** The home headline as composed, so later composes can avoid repeating it. */
  headline?: Bilingual | null;
}

// ── Copy critic ──────────────────────────────────────────────────────────────

const CRITIC_TIMEOUT_MS = 10_000;

/** Headlines of the last 500 composed sites (other tenants): what a new site must not repeat. */
async function loadHeadlineBank(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>, tenantId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("agencies")
    .select("id, settings->site_compose->headline")
    .neq("id", tenantId)
    .not("settings->site_compose->headline", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    logServerError("compose.critic.bank", error);
    return [];
  }
  const out: string[] = [];
  for (const row of (data ?? []) as Array<{ headline: Bilingual | null }>) {
    if (row.headline?.es) out.push(row.headline.es);
    if (row.headline?.en) out.push(row.headline.en);
  }
  return out;
}

/** Deterministic bank check first; the routed critic model only when that passes. Never blocks on a model failure. */
async function criticVerdict(input: {
  copy: Record<string, Bilingual>;
  facts: CopyPassFacts;
  primaryLocale: "es" | "en";
  bank: readonly string[];
  tenantId: string;
  actorProfileId: string | null;
  siteComposeId: string;
}): Promise<CriticVerdict> {
  const bankProblems = checkHeadlineBank(input.copy, input.bank);
  if (bankProblems.length > 0) return { ok: false, problems: bankProblems, source: "bank" };
  try {
    const { adapter, model } = await resolveRoutedChat("critic");
    const prompt = buildCriticPrompt({ copy: input.copy, facts: input.facts, primaryLocale: input.primaryLocale });
    const t0 = Date.now();
    const pending = adapter.chatCompletion({ ...prompt, jsonSchema: CRITIC_JSON_SCHEMA, maxTokens: 600, temperature: 0, model });
    const result = await raceWithTimeout(pending, CRITIC_TIMEOUT_MS);
    void pending
      .then((r) =>
        recordAiGenerationUsage({
          provider: adapter.id,
          model: r.ok ? (r.model ?? model ?? "auto") : (model ?? "auto"),
          usage: r.ok ? r.usage : undefined,
          actorProfileId: input.actorProfileId,
          ok: r.ok,
          scope: "site_compose_critic",
          latencyMs: Date.now() - t0,
          tenantId: input.tenantId,
          context: { site_compose_id: input.siteComposeId, timed_out: result === null },
        }),
      )
      .catch((err) => logServerError("compose.critic.usage", err));
    if (!result?.ok) return { ok: true, problems: [], source: "none" };
    const problems = parseCriticReply(result.text);
    if (problems === null) return { ok: true, problems: [], source: "none" };
    return { ok: problems.length === 0, problems, source: "model" };
  } catch (err) {
    logServerError("compose.critic", err);
    return { ok: true, problems: [], source: "none" };
  }
}

/** Nav labels per family: what the catalogue and the transaction ARE for this kind of business. */
export const FAMILY_NAV_LABELS: Readonly<Record<BusinessFamilyId, { catalogue: Bilingual; transaction: Bilingual }>> = {
  dining: { catalogue: { es: "Menú", en: "Menu" }, transaction: { es: "Reservar", en: "Reserve" } },
  beauty: { catalogue: { es: "Servicios", en: "Services" }, transaction: { es: "Agendar", en: "Book" } },
  wellness: { catalogue: { es: "Servicios", en: "Services" }, transaction: { es: "Agendar", en: "Book" } },
  fitness: { catalogue: { es: "Clases", en: "Classes" }, transaction: { es: "Reservar lugar", en: "Book a spot" } },
  events: { catalogue: { es: "Espacios", en: "Spaces" }, transaction: { es: "Reservar", en: "Reserve" } },
  agency: { catalogue: { es: "Servicios", en: "Services" }, transaction: { es: "Solicitar", en: "Inquire" } },
  professional: { catalogue: { es: "Servicios", en: "Services" }, transaction: { es: "Agendar", en: "Book" } },
  education: { catalogue: { es: "Clases", en: "Classes" }, transaction: { es: "Inscribirse", en: "Enrol" } },
  hospitality: { catalogue: { es: "Espacios", en: "Spaces" }, transaction: { es: "Reservar", en: "Reserve" } },
  craft: { catalogue: { es: "Trabajos", en: "Work" }, transaction: { es: "Encargar", en: "Commission" } },
  tours: { catalogue: { es: "Tours", en: "Tours" }, transaction: { es: "Reservar", en: "Book" } },
  custom: { catalogue: { es: "Servicios", en: "Services" }, transaction: { es: "Agendar", en: "Book" } },
};

/** Public slugs per family: the catalogue is what the type sells. */
function pageHrefsFor(family: BusinessFamilyId): Record<SitePageRole, string> {
  const catalogue = family === "dining" ? "/menu" : family === "fitness" || family === "education" ? "/clases" : family === "events" || family === "hospitality" ? "/espacios" : family === "tours" ? "/tours" : "/servicios";
  const transaction = family === "dining" || family === "events" || family === "hospitality" ? "/reservar" : "/agendar";
  return { home: "/", catalogue, transaction, about: "/nosotros", contact: "/contacto", gallery: "/galeria" };
}

/**
 * `work.industry` is free text ("food and restaurant", "salón de uñas"). Try
 * the whole phrase, then its words longest-first, so the live El Paisa brief
 * resolves to `restaurant` instead of falling through to the tenant default.
 */
export function businessTypeFromIndustry(industry: string): { id: string; family: BusinessFamilyId } | null {
  const whole = searchBusinessTypes(industry)[0];
  if (whole) return { id: whole.id, family: whole.family };
  const words = industry.split(/[^\p{L}]+/u).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length);
  for (const w of words) {
    const hit = searchBusinessTypes(w)[0];
    if (hit) return { id: hit.id, family: hit.family };
  }
  return null;
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

async function writeStamp(admin: SupabaseClient, tenantId: string, stamp: SiteComposeStamp): Promise<void> {
  try {
    const { data, error } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle<{ settings: unknown }>();
    if (error) throw error;
    const settings = (data?.settings && typeof data.settings === "object" ? data.settings : {}) as Record<string, unknown>;
    const { error: upErr } = await admin.from("agencies").update({ settings: { ...settings, site_compose: stamp } }).eq("id", tenantId);
    if (upErr) throw upErr;
  } catch (error) {
    logServerError("compose.stamp", error);
  }
}

/** The public theme is served from the `branding` cache tag (reads.ts); a new Look must reach the page now, not after a restart. */
function bustBrandingCache(tenantId: string): void {
  try {
    updateTag(tagFor(tenantId, "branding"));
  } catch {
    /* outside a request scope (scripts, tests): nothing to bust */
  }
}
function bustIdentityCache(tenantId: string): void {
  try {
    updateTag(tagFor(tenantId, "identity"));
  } catch {
    /* outside a request scope */
  }
}
/**
 * A compose rewrites the homepage, the shell, the pages, the theme and the
 * name: every public cache surface of the tenant is stale afterwards. The
 * page writers bust their own tags; this is the belt for the ones that
 * render one compose behind (seen live: previous hero under the new name).
 */
function bustAllTenantCaches(tenantId: string): void {
  try {
    for (const tag of tenantBustTags(tenantId)) updateTag(tag);
  } catch {
    /* outside a request scope */
  }
}

const EMPTY_PLACED: SiteComposePlaced = { photos: { hero: null, heroSource: null, gallery: 0, level: null, pendingJobId: null }, menuItems: 0, hoursPresent: false, whatsappPresent: false, logoPresent: false };

// ── Main ────────────────────────────────────────────────────────────────────

export async function composeSiteFromBrief(input: ComposeSiteInput): Promise<ComposeSiteResult> {
  const started = Date.now();
  const siteComposeId = randomUUID();
  const notes: string[] = [];
  const admin = createServiceRoleClient();
  const fail = (why: string, partial: Partial<ComposeSiteResult> = {}): ComposeSiteResult => {
    const result: ComposeSiteResult = {
      outcome: "failed",
      siteComposeId,
      lookId: partial.lookId ?? "",
      typeId: partial.typeId ?? "custom",
      family: partial.family ?? "custom",
      pageIds: partial.pageIds ?? {},
      shellPageId: partial.shellPageId ?? null,
      copySource: partial.copySource ?? "defaults",
      imagePicks: partial.imagePicks ?? { owner: 0, stock: 0, none: 0 },
      placed: partial.placed ?? EMPTY_PLACED,
      notes: [...notes, why],
      costUsd: 0,
      durationMs: Date.now() - started,
    };
    // The stamp is written on EVERY outcome so the arrival screen and the
    // workspace card can read it without re-calling (onboarding v3.2).
    if (admin) void writeStamp(admin, input.tenantId, { outcome: "failed", siteComposeId, lookId: result.lookId, typeId: result.typeId, family: result.family, at: new Date().toISOString(), pageIds: result.pageIds, placed: result.placed, copySource: result.copySource, notes: result.notes });
    return result;
  };
  if (!admin) return fail("service role client unavailable");

  // 1. Who is this business.
  const { data: agency, error: agencyErr } = await admin.from("agencies").select("id, slug, display_name, settings, workspace_type, supported_locales").eq("id", input.tenantId).maybeSingle<{ id: string; slug: string; display_name: string | null; settings: unknown; workspace_type: string | null; supported_locales: string[] | null }>();
  if (agencyErr || !agency) return fail(`tenant not found: ${agencyErr?.message ?? input.tenantId}`);
  let identityRow = await loadIdentityForStaff(admin, input.tenantId);
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
    const hit = businessTypeFromIndustry(industry);
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
  // The chat launcher, the shell and the SEO title all read
  // `agency_business_identity.public_name`; a tenant provisioned without one
  // would greet visitors as "the agency". Seed it with the name we are about
  // to put on the site (never overwriting a row that exists).
  const statedName = (facts ? stringFact(facts, "business.name") : null)?.trim() || null;
  if (!identityRow) {
    const { error: idErr } = await admin.from("agency_business_identity").upsert({ tenant_id: input.tenantId, public_name: businessName }, { onConflict: "tenant_id", ignoreDuplicates: true });
    if (idErr) notes.push(`identity row not seeded: ${idErr.message}`);
    identityRow = await loadIdentityForStaff(admin, input.tenantId);
  } else if (statedName && identityRow.public_name?.trim() !== statedName) {
    // The brief's stated name is the newest fact: the legacy header, the chat
    // button and the mobile menu read `public_name`, so a stale seed here
    // would show one name in the chrome and another on the page.
    const { error: nameErr } = await admin.from("agency_business_identity").update({ public_name: statedName }).eq("tenant_id", input.tenantId);
    if (nameErr) notes.push(`public name not updated: ${nameErr.message}`);
    else {
      identityRow = { ...identityRow, public_name: statedName };
      bustIdentityCache(input.tenantId);
    }
  }
  const logoUrl = await resolveLogoUrl(admin, input.tenantId, facts);
  const hrefs = pageHrefsFor(family);
  const identity: SiteIdentity = {
    businessName,
    tagline: pick(identityRow?.tagline),
    // `person.city` is "Where you work" (fact-keys.ts); `business.works_from` is a
    // premises kind, not a place.
    city: pick(identityRow?.address_city, facts ? stringFact(facts, "person.city") : null),
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

  // 6. Images: owner media, the tenant's own generated images, then the pool
  //    for the type (tag matches first), the family, the universal pack.
  const stockAltFallback: Bilingual = {
    es: identity.city ? `${typeRow ? typeRow.label.es : typeId} en ${identity.city}` : (typeRow ? typeRow.label.es : typeId),
    en: identity.city ? `${typeRow ? typeRow.label.en : typeId} in ${identity.city}` : (typeRow ? typeRow.label.en : typeId),
  };
  const stockFacts = stockFactsFromBrief(brief, family);
  const briefTags = Object.fromEntries(Object.entries(stockFacts).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const [owner, stock] = await Promise.all([loadOwnerImages(admin, input.tenantId), queryLifestyleStockForType(admin, { businessType: typeId, family, forTenantId: input.tenantId })]);
  const { resolve: images, picks } = buildImageResolver(
    [
      ...owner.map((o) => ({ ...o, level: "owner" as const })),
      ...stock.map<CandidateImage>((s) => ({
        src: s.url,
        width: s.width,
        height: s.height,
        // A stock image with no alt would block publish (alt is a floor
        // requirement); say what it is for, from the facts, never from a guess.
        alt: s.alt.es.trim() || s.alt.en.trim() ? s.alt : stockAltFallback,
        role: s.role,
        owner: false,
        level: s.originTenantId === input.tenantId ? "tenant" : s.businessType ? "type" : s.family === family ? "family" : "universal",
        stockId: s.id,
        direction: s.direction,
        tags: s.tags,
        timesPlaced: s.timesPlaced,
      })),
    ],
    { briefTags },
  );
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

  // 8. One bounded copy pass. Nav labels are deterministic per family and
  // never the model's to change.
  const navLabels = FAMILY_NAV_LABELS[family];
  // Search snippet seeded from the facts: the copy pass rewrites it in the
  // same call (no second cost); when the pass is skipped this is what ships.
  const seoTypeLabel = typeRow ? typeRow.label : { es: typeId, en: typeId };
  const seoDefaults: Record<string, Bilingual> = {
    "seo.title": { es: identity.city ? `${businessName} en ${identity.city}` : businessName, en: identity.city ? `${businessName} in ${identity.city}` : businessName },
    "seo.description": {
      es: identity.city ? `${seoTypeLabel.es} en ${identity.city}.` : `${seoTypeLabel.es}.`,
      en: identity.city ? `${seoTypeLabel.en} in ${identity.city}.` : `${seoTypeLabel.en}.`,
    },
  };
  let copyOverrides: Record<string, Bilingual> = { ...seoDefaults, "nav.catalogue": navLabels.catalogue, "nav.transaction": navLabels.transaction };
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
      const copyDefaults = { ...look.copy, ...seoDefaults };
      const prompt = buildCopyPassPrompt({ facts: copyFacts, defaults: copyDefaults, keys: COPY_PASS_KEYS, primaryLocale: locale });
      // Routed per call (Operations → AI routing); Sonnet 5 unless an admin
      // chose otherwise. The model the adapter serves is what the usage row records.
      const { adapter, model: routedModel } = await resolveRoutedChat("copy");
      const copyModel = routedModel ?? "claude-sonnet-5";
      const writeCopy = async (attempt: "draft" | "retry", extraUserMessage: string) => {
        const t0 = Date.now();
        const pending = adapter.chatCompletion({ ...prompt, userMessage: prompt.userMessage + extraUserMessage, jsonSchema: COPY_PASS_JSON_SCHEMA, maxTokens: COPY_PASS_MAX_TOKENS, model: copyModel });
        const result = await raceWithTimeout(pending, COPY_PASS_TIMEOUT_MS);
        // The provider call keeps running after a timeout and still costs money:
        // record its usage when it lands, flagged, so the per-site cost is honest.
        void pending
          .then((r) =>
            recordAiGenerationUsage({
              provider: adapter.id,
              model: r.ok ? (r.model ?? copyModel) : copyModel,
              usage: r.ok ? r.usage : undefined,
              actorProfileId: input.actorProfileId ?? null,
              ok: r.ok,
              scope: "site_compose_copy",
              latencyMs: Date.now() - t0,
              tenantId: input.tenantId,
              context: { site_compose_id: siteComposeId, look: look.id, business_type: typeId, attempt, timed_out: result === null, used: result !== null && r.ok },
            }),
          )
          .catch((err) => logServerError("compose.copyPass.usage", err));
        if (!result?.ok) {
          notes.push(result === null ? `copy ${attempt} timed out` : `copy ${attempt} failed (${result.code}: ${result.message.slice(0, 120)})`);
          return null;
        }
        const screened = screenCopyReply(result.text, { facts: copyFacts, defaults: copyDefaults, keys: COPY_PASS_KEYS, primaryLocale: locale });
        if (screened.dropped.length > 0) notes.push(`copy ${attempt} lines dropped: ${screened.dropped.map((d) => `${d.key} (${d.reason})`).join(", ")}`);
        return screened.copy;
      };
      // The critic: a headline another site already carries, one that fits
      // any business, or a fact the screener missed, costs one retry with the
      // problems in the prompt. A second failure ships the defaults.
      const bank = await loadHeadlineBank(admin, input.tenantId);
      let accepted: Record<string, Bilingual> | null = null;
      let draft = await writeCopy("draft", "");
      if (draft && Object.keys(draft).length > 0) {
        const verdict = await criticVerdict({ copy: draft, facts: copyFacts, primaryLocale: locale, bank, tenantId: input.tenantId, actorProfileId: input.actorProfileId ?? null, siteComposeId });
        if (verdict.ok) {
          accepted = draft;
        } else {
          notes.push(`critic (${verdict.source}) rejected the draft: ${verdict.problems.map((p) => `${p.key}: ${p.reason}`).join("; ").slice(0, 400)}`);
          const firstDraft = draft;
          const firstBad = new Set(verdict.problems.map((p) => p.key));
          draft = await writeCopy("retry", retryInstruction(verdict.problems, bank));
          if (!draft || Object.keys(draft).length === 0) {
            // The retry produced nothing usable (timeout, not JSON): the first
            // draft's passed lines are still better than the Look's defaults.
            const kept = Object.fromEntries(Object.entries(firstDraft).filter(([k]) => !firstBad.has(k)));
            if (Object.keys(kept).length > 0) {
              accepted = kept;
              notes.push(`retry unusable; first draft kept minus ${[...firstBad].join(", ")}`);
            }
          } else {
            const again = await criticVerdict({ copy: draft, facts: copyFacts, primaryLocale: locale, bank, tenantId: input.tenantId, actorProfileId: input.actorProfileId ?? null, siteComposeId });
            if (again.ok) accepted = draft;
            else {
              // Keep every line the critic passed; only the named keys fall
              // back. Throwing the whole draft away over two generic
              // headlines shipped a taquería with the Look's placeholder copy
              // (p12 real-model run).
              const bad = new Set(again.problems.map((p) => p.key));
              const kept = Object.fromEntries(Object.entries(draft).filter(([k]) => !bad.has(k)));
              if (Object.keys(kept).length > 0) accepted = kept;
              notes.push(`critic rejected the retry too; defaults used for: ${[...bad].join(", ")}${Object.keys(kept).length ? ` (${Object.keys(kept).length} lines kept)` : ""}`);
            }
          }
        }
      }
      if (accepted) {
        copyOverrides = { ...copyOverrides, ...accepted };
        copySource = "model";
      } else {
        notes.push("copy pass produced nothing accepted; defaults used");
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
  else bustBrandingCache(input.tenantId);

  const home = await ensureHomepageRow(admin, { tenantId: input.tenantId, locale: writeLocale });
  if (!home.ok) return fail(`homepage row: ${home.code ?? "ensure failed"}`, { lookId: look.id, typeId, family });
  const saved = await saveHomepageDraftComposition(admin, {
    tenantId: input.tenantId,
    values: {
      tenantId: input.tenantId,
      locale: writeLocale,
      expectedVersion: home.data.version,
      metadata: {
        title: copyOverrides["seo.title"]?.[locale] ?? businessName,
        metaDescription: copyOverrides["seo.description"]?.[locale] ?? undefined,
        introTagline: undefined, ogTitle: undefined, ogDescription: undefined, ogImageUrl: undefined, canonicalUrl: undefined, noindex: false,
      },
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
    catalogue: navLabels.catalogue,
    transaction: navLabels.transaction,
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
    const { data: usage, error: usageErr } = await admin.from("cms_ai_usage_log").select("context_jsonb").eq("tenant_id", input.tenantId).contains("context_jsonb", { site_compose_id: siteComposeId });
    if (usageErr) notes.push(`cost not read: ${usageErr.message}`);
    for (const row of (usage ?? []) as Array<{ context_jsonb: { cost_usd?: number } | null }>) costUsd += Number(row.context_jsonb?.cost_usd ?? 0);
  } catch {
    /* cost is informational */
  }

  const imagePicks = { owner: picks.filter((p) => p.source === "owner").length, stock: picks.filter((p) => p.source === "stock").length, none: picks.filter((p) => p.source === "none").length };
  const degraded = !brief || copySource === "defaults" || imagePicks.none > 0 || !shell.ok;
  const outcome: ComposeOutcome = degraded ? "fallback_used" : !logoUrl ? "missing_logo" : "composed";
  if (!logoUrl) notes.push("no logo; the wordmark carries the header");

  // 10b. Store the selection (03 §5) and, for a verified account, enqueue the
  //      per-site generation (03 §4b). Neither blocks arrival.
  const placedPicks = picks.filter((p) => p.src);
  const assignments = await writeAssignments(admin, {
    tenantId: input.tenantId,
    siteComposeId,
    picks: placedPicks.map((p) => ({ pageRole: p.page, slot: p.slot, assetId: p.stockId, src: p.src as string, source: assignmentSourceForLevel(p.level ?? "universal"), direction: p.direction })),
  });
  if (assignments.error) notes.push(`assignments not stored: ${assignments.error}`);
  let pendingJobId: string | null = null;
  if (!assignments.error && placedPicks.length > 0) {
    const job = await enqueueTenantImageJob(admin, {
      tenantId: input.tenantId,
      actorProfileId: input.actorProfileId ?? null,
      siteComposeId,
      typeId,
      family,
      facts: stockFacts,
      slots: placedPicks.filter((p) => p.level !== "owner" && p.level !== "tenant").map((p) => ({ pageRole: p.page, slot: p.slot })),
    });
    if (job.ok) pendingJobId = job.jobId;
    else notes.push(`tenant images: ${job.reason}`);
  }

  // What was REALLY placed, so the arrival copy claims nothing more.
  const heroPick = picks.find((p) => p.slot === "hero" && p.page === "home") ?? picks.find((p) => p.slot === "hero");
  const levelRank = { owner: 0, tenant: 1, type: 2, family: 3, universal: 4 } as const;
  const worst = picks.filter((p) => p.level).map((p) => p.level as keyof typeof levelRank).sort((a, b) => levelRank[b] - levelRank[a])[0] ?? null;
  const placed: SiteComposePlaced = {
    photos: {
      hero: heroPick?.level ?? null,
      heroSource: heroPick?.level ? assignmentSourceForLevel(heroPick.level) : null,
      gallery: picks.filter((p) => p.slot.startsWith("gallery") && p.source !== "none").length,
      level: worst,
      pendingJobId,
    },
    menuItems: 0, // the menu board reads live offerings; intake's import writes them, not the composer
    hoursPresent: (identity.hours ?? []).length > 0,
    whatsappPresent: !!identity.whatsapp && identity.whatsapp.replace(/\D/g, "").length >= 8,
    logoPresent: !!logoUrl,
  };
  await writeStamp(admin, input.tenantId, { outcome, siteComposeId, lookId: look.id, typeId, family, at: new Date().toISOString(), pageIds, placed, copySource, notes, headline: copyOverrides["home.offer.headline"] ?? null });
  bustAllTenantCaches(input.tenantId);

  return { outcome, siteComposeId, lookId: look.id, typeId, family, pageIds, shellPageId: shell.ok ? shell.pageId : null, copySource, imagePicks, placed, notes, costUsd, durationMs: Date.now() - started };
}
