/**
 * Database side of the foundation seeder. Everything takes the Supabase client
 * as an argument, so the unit tests drive it with an in-memory fake and
 * --dry-run drives it with a client that throws on any write.
 *
 * Safety rules, all enforced here rather than left to the caller:
 *  - only demo rows: TAL-93xxx code, demo email domain, auth user carrying
 *    app_metadata.demo_batch = DEMO_BATCH;
 *  - the shared password is handed to the auth admin call inside `ensureUser`;
 *    it never reaches a log, an error, the manifest or status.json;
 *  - the 10 live demos get content only: no name, city, email, photo, site or
 *    publication change;
 *  - new demo sites are created as drafts and are never published here.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../../src/lib/talent-site/default-max-site-trees";
import { slugifySiteName } from "../../src/lib/talent-site/server/derive-site-slug";
import { DEMO_BATCH } from "./demos";
import { assertDemoIdentity, redact } from "./demo-identity";
import type { FoundationDemo } from "./foundation-load";
import {
  buildAvailabilityCells,
  buildFieldValuePlan,
  buildLanguageRows,
  buildOfferingRows,
  buildProfilePatch,
  buildServicesMenu,
  checkDemoData,
  chooseSiteSlug,
  deriveHours,
  emptyNamespace,
  plannedCounts,
  predictCompleteness,
  warnDemoData,
  type FieldDef,
  type FieldPlan,
  type PlannedCounts,
  type SlugNamespace,
} from "./foundation-plan";

export const BUCKET = "media-public";
export const MIGRATION_HINT =
  "migration 20261231298100 (taxonomy expansion) must be live in this database before these demos can be seeded";

type Admin = SupabaseClient;
type DbError = { message: string } | null;

/** Unwrap a supabase-js result: throw with the table name on error. */
function must<T>(res: { data: T; error: DbError }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// ── Read-only client (used by --dry-run and verify) ─────────────────────────

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);
const AUTH_READ_METHODS = new Set(["listUsers", "getUserById"]);

/**
 * Wrap a client so any write throws. `from().select()` and the two auth admin
 * reads pass through; rpc, storage and every other auth admin call throw.
 */
export function readOnly(client: Admin): Admin {
  const guardBuilder = (b: object): object =>
    new Proxy(b, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && WRITE_METHODS.has(prop)) {
          throw new Error(`READ-ONLY client: refused ${prop}()`);
        }
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  const adminAuth = new Proxy(client.auth.admin, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !AUTH_READ_METHODS.has(prop)) {
        throw new Error(`READ-ONLY client: refused auth.admin.${prop}()`);
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") return (t: string) => guardBuilder(target.from(t));
      if (prop === "rpc") return () => { throw new Error("READ-ONLY client: refused rpc()"); };
      if (prop === "storage") throw new Error("READ-ONLY client: refused storage");
      if (prop === "auth") return { ...target.auth, admin: adminAuth };
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as Admin;
}

// ── Reads shared by dry-run, seed and verify ────────────────────────────────

/** Page through a table (PostgREST caps a response at 1000 rows). */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await build(from, from + 999), what) ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** The platform hub, resolved the way the hub auto-enroll trigger does. */
export async function resolveHubTenantId(admin: Admin): Promise<string> {
  const data = must(
    await admin.from("agencies").select("id").eq("kind", "hub").eq("plan_tier", "network").eq("status", "active"),
    "agencies(hub)",
  );
  if (data?.length !== 1) throw new Error(`expected exactly one active hub, found ${data?.length ?? 0}`);
  return (data[0] as { id: string }).id;
}

/** Active talent_type term ids by slug. Missing slugs come back in `missing`. */
export async function resolveTermIds(
  admin: Admin,
  slugs: readonly string[],
): Promise<{ ids: Map<string, string>; missing: string[] }> {
  const unique = [...new Set(slugs)];
  const ids = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const rows = must(
      await admin
        .from("taxonomy_terms")
        .select("id, slug, created_at")
        .eq("kind", "talent_type")
        .eq("is_active", true)
        .is("archived_at", null)
        .in("slug", unique.slice(i, i + 100))
        .order("created_at", { ascending: true }),
      "taxonomy_terms",
    ) as { id: string; slug: string }[];
    for (const r of rows ?? []) if (!ids.has(r.slug)) ids.set(r.slug, r.id);
  }
  return { ids, missing: unique.filter((s) => !ids.has(s)) };
}

/** Field definitions by key. */
export async function loadFieldDefs(admin: Admin, keys: readonly string[]): Promise<Map<string, FieldDef>> {
  const unique = [...new Set(keys)];
  const out = new Map<string, FieldDef>();
  for (let i = 0; i < unique.length; i += 60) {
    const rows = must(
      await admin
        .from("profile_field_definitions")
        .select("id, field_key, kind, options, is_sensitive, deprecated_at, validation_rules")
        .in("field_key", unique.slice(i, i + 60)),
      "profile_field_definitions",
    ) as FieldDef[];
    for (const r of rows ?? []) out.set(r.field_key, r);
  }
  return out;
}

/** Every subdomain label already taken, read once (select only, no RPC). */
export async function loadSlugNamespace(admin: Admin, nowIso: string): Promise<SlugNamespace> {
  const ns = emptyNamespace();
  const sites = await selectAll<{ site_slug: string | null }>(
    (a, b) => admin.from("talent_sites").select("site_slug").not("site_slug", "is", null).range(a, b),
    "talent_sites",
  );
  for (const r of sites) if (r.site_slug) ns.siteSlugs.add(r.site_slug.toLowerCase());
  const agencies = await selectAll<{ slug: string | null }>(
    (a, b) => admin.from("agencies").select("slug").range(a, b),
    "agencies",
  );
  for (const r of agencies) if (r.slug) ns.agencySlugs.add(r.slug.toLowerCase());
  const domains = await selectAll<{ hostname: string | null }>(
    (a, b) => admin.from("agency_domains").select("hostname").eq("kind", "subdomain").range(a, b),
    "agency_domains",
  );
  for (const r of domains) if (r.hostname) ns.domainLabels.add(r.hostname.split(".")[0].toLowerCase());
  const reservations = await selectAll<{ slug: string | null }>(
    (a, b) => admin.from("saas_subdomain_reservations").select("slug").gt("expires_at", nowIso).range(a, b),
    "saas_subdomain_reservations",
  );
  for (const r of reservations) if (r.slug) ns.reservations.add(r.slug.toLowerCase());
  const parts = await selectAll<{ public_slug_part: string | null }>(
    (a, b) => admin.from("talent_profiles").select("public_slug_part").not("public_slug_part", "is", null).range(a, b),
    "talent_profiles.public_slug_part",
  );
  for (const r of parts) if (r.public_slug_part) ns.publicSlugParts.add(r.public_slug_part.toLowerCase());
  return ns;
}

/** Accent-insensitive key for matching city names. */
export function cityKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Alternate spellings of the same place (normalized keys) in the locations registry. */
const CITY_ALIASES: Record<string, string[]> = {
  ciudaddemexico: ["mexicocity", "cdmx", "distritofederal"],
  cdmx: ["mexicocity", "ciudaddemexico"],
  newyorkcity: ["newyork"],
  nyc: ["newyork"],
  washingtondc: ["washington"],
  losangeles: ["la"],
  sanfrancisco: ["sf"],
};

/** Countries the demos live in. */
export const DEMO_COUNTRIES = ["MX", "US", "AR"] as const;

/** Normalized city key to location id, per country (Santa Fe in the US is not Santa Fe in Argentina). */
export type LocationIndex = Map<string, string>;

const locKey = (country: string, name: string) => `${country}:${cityKey(name)}`;

/** Locations of the demo countries by normalized name (en, es and city_slug all point at the id). */
export async function loadLocationIndex(admin: Admin): Promise<LocationIndex> {
  const rows = await selectAll<{
    id: string;
    country_code: string;
    city_slug: string | null;
    display_name_i18n: Record<string, string | null> | null;
  }>(
    (a, b) =>
      admin
        .from("locations")
        .select("id, country_code, city_slug, display_name_i18n")
        .in("country_code", [...DEMO_COUNTRIES])
        .eq("active", true)
        .is("archived_at", null)
        .range(a, b),
    "locations",
  );
  const idx: LocationIndex = new Map();
  for (const r of rows) {
    for (const n of [r.display_name_i18n?.en, r.display_name_i18n?.es, r.city_slug]) {
      if (n && !idx.has(locKey(r.country_code, n))) idx.set(locKey(r.country_code, n), r.id);
    }
  }
  return idx;
}

export function findLocationId(idx: LocationIndex, city: string, country = "MX"): string | null {
  const k = locKey(country, city);
  if (idx.has(k)) return idx.get(k)!;
  for (const alias of CITY_ALIASES[cityKey(city)] ?? []) if (idx.has(`${country}:${alias}`)) return idx.get(`${country}:${alias}`)!;
  return null;
}

// ── Auth users ──────────────────────────────────────────────────────────────

export type AuthCache = { byEmail: Map<string, User> };

export async function loadAuthUsers(admin: Admin): Promise<AuthCache> {
  const byEmail = new Map<string, User>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth.listUsers: ${error.message}`);
    for (const u of data.users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
    if (data.users.length < 200) return { byEmail };
  }
}

/** Refuse anything that is not a demo user; returns the existing user or null. */
export function checkDemoUser(cache: AuthCache, email: string): User | null {
  const existing = cache.byEmail.get(email.toLowerCase()) ?? null;
  if (existing && existing.app_metadata?.demo_batch !== DEMO_BATCH) {
    throw new Error(`REFUSE: ${email} exists and is not a ${DEMO_BATCH} demo user`);
  }
  return existing;
}

async function ensureUser(
  admin: Admin,
  cache: AuthCache,
  d: FoundationDemo,
  password: string,
  setPassword: boolean,
): Promise<string> {
  const appMeta = { demo: true, demo_batch: DEMO_BATCH };
  const existing = checkDemoUser(cache, d.email);
  let userId: string;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: { full_name: d.displayName },
      app_metadata: appMeta,
    });
    if (error) throw new Error(`auth update ${d.profileCode}: ${redact(error.message, [password])}`);
    userId = existing.id;
  } else {
    if (d.isLive) throw new Error(`REFUSE: live demo ${d.profileCode} has no auth user (${d.email})`);
    const { data, error } = await admin.auth.admin.createUser({
      email: d.email,
      email_confirm: true,
      user_metadata: { full_name: d.displayName },
      app_metadata: appMeta,
    });
    if (error || !data.user) throw new Error(`auth create ${d.profileCode}: ${redact(error?.message ?? "no user", [password])}`);
    userId = data.user.id;
    cache.byEmail.set(d.email.toLowerCase(), data.user);
  }
  if (!setPassword) return userId;
  // The one shared demo password, set in its own call so no other payload (or
  // error) ever carries it.
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwErr) throw new Error(`auth password ${d.profileCode}: ${redact(pwErr.message, [password])}`);
  return userId;
}

// ── Manifest (kept outside the repo, which is public) ───────────────────────

export type ManifestEntry = {
  profileCode: string;
  email: string;
  userId: string;
  talentProfileId: string;
  siteSlug: string;
  mediaAssetIds: string[];
  storagePaths: string[];
  photoSources: string[];
  bookingHours?: boolean;
  createdAt: string;
  /** Written by the foundation seeder so --remove can name everything it made. */
  offeringIds?: string[];
  fieldValueDefinitionIds?: string[];
  languageCodes?: string[];
  serviceAreaIds?: string[];
  createdSite?: boolean;
  createdProfile?: boolean;
};
export type Manifest = { batch: string; targetRef: string; entries: Record<string, ManifestEntry> };

export function loadManifest(file: string, targetRef: string): Manifest {
  if (fs.existsSync(file)) {
    const m = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
    if (m.targetRef !== targetRef) throw new Error(`manifest is for ${m.targetRef}, not ${targetRef}`);
    return m;
  }
  return { batch: DEMO_BATCH, targetRef, entries: {} };
}

export function saveManifest(file: string, m: Manifest) {
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
}

/** The manifest and status files must live outside the repo. */
export function assertOutsideRepo(file: string, cwd: string = process.cwd()) {
  if (path.resolve(file).startsWith(path.resolve(cwd, ".."))) {
    throw new Error("REFUSE: keep the manifest and status files outside the repo (the repo is public)");
  }
}

// ── status.json ─────────────────────────────────────────────────────────────

export type StatusEntry = {
  demo_id: string;
  code: string;
  email: string;
  profile_id: string;
  site_slug: string;
  offerings: number;
  photos: number;
  site_published: boolean;
  completeness: string;
  seeded_at: string;
};

/** Merge one demo into status.json (keyed by demo id). No secrets in an entry. */
export function mergeStatus(file: string, entry: StatusEntry) {
  let current: Record<string, StatusEntry> = {};
  if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, StatusEntry>;
  current[entry.demo_id] = entry;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
  fs.renameSync(tmp, file);
}

// ── Seeding ─────────────────────────────────────────────────────────────────

export type SeedContext = {
  admin: Admin;
  hubTenantId: string;
  termIds: Map<string, string>;
  fieldDefs: Map<string, FieldDef>;
  namespace: SlugNamespace;
  locations: LocationIndex;
  auth: AuthCache;
  /** The shared demo password (DEMO_PASSWORD). Never logged or written. */
  password: string;
  now: Date;
  /** Live demos: replace their offerings, menu, hours, site content and more (--include-live-content). Off by default. */
  includeLiveContent?: boolean;
  /** Live demos: also set the shared password (--set-live-password). Off by default. */
  setLivePassword?: boolean;
  manifest: Manifest;
  saveManifest: () => void;
  onStatus?: (e: StatusEntry) => void;
  log: (line: string) => void;
};

/** Replace the demo's four offerings; returns their ids in sort order. */
async function writeOfferings(ctx: SeedContext, profileId: string, rows: ReturnType<typeof buildOfferingRows>["rows"]) {
  must(await ctx.admin.from("talent_offerings").delete().eq("talent_profile_id", profileId), "talent_offerings delete");
  const inserted = must(
    await ctx.admin
      .from("talent_offerings")
      .insert(rows.map((r) => ({ ...r, talent_profile_id: profileId })))
      .select("id, sort_order"),
    "talent_offerings insert",
  ) as { id: string; sort_order: number }[] | null;
  return (inserted ?? []).sort((a, b) => a.sort_order - b.sort_order).map((o) => o.id);
}

/** One of the demo's own gallery photos per service card, only when it has gallery photos. */
async function linkOfferingPhotos(ctx: SeedContext, profileId: string, offeringIds: string[]) {
  if (!offeringIds.length) return;
  const photos = must(
    await ctx.admin
      .from("media_assets")
      .select("id")
      .eq("owner_talent_profile_id", profileId)
      .eq("variant_kind", "gallery")
      .is("deleted_at", null)
      .order("sort_order"),
    "media_assets(gallery)",
  ) as { id: string }[] | null;
  if (!photos?.length) return;
  const links = offeringIds.map((id, i) => ({ offering_id: id, media_asset_id: photos[i % photos.length].id, sort_order: 0 }));
  must(await ctx.admin.from("talent_offering_media").insert(links), "talent_offering_media insert");
}

async function writeFieldValues(ctx: SeedContext, profileId: string, plan: FieldPlan): Promise<string[]> {
  const idOf = (k: string) => ctx.fieldDefs.get(k)?.id;
  const rows = plan.values.map((v) => ({
    tenant_id: ctx.hubTenantId,
    talent_profile_id: profileId,
    field_definition_id: idOf(v.fieldKey)!,
    value: v.value,
    workflow_state: "live",
    last_edited_role: "platform",
  }));
  for (let i = 0; i < rows.length; i += 200) {
    must(
      await ctx.admin
        .from("talent_profile_field_values")
        .upsert(rows.slice(i, i + 200), { onConflict: "talent_profile_id,field_definition_id" }),
      "talent_profile_field_values upsert",
    );
  }
  // Re-runs: drop values this seeder owns that the plan no longer contains.
  const keep = new Set(rows.map((r) => r.field_definition_id));
  const stale = plan.managedKeys.map(idOf).filter((id): id is string => !!id && !keep.has(id));
  for (let i = 0; i < stale.length; i += 100) {
    must(
      await ctx.admin
        .from("talent_profile_field_values")
        .delete()
        .eq("talent_profile_id", profileId)
        .in("field_definition_id", stale.slice(i, i + 100)),
      "talent_profile_field_values stale delete",
    );
  }
  if (plan.heightCm != null) {
    must(await ctx.admin.from("talent_profiles").update({ height_cm: plan.heightCm }).eq("id", profileId), "height_cm mirror");
  }
  return [...keep];
}

async function writeServiceAreas(ctx: SeedContext, d: FoundationDemo, profileId: string): Promise<string[]> {
  const home = findLocationId(ctx.locations, d.city, d.country);
  if (!home) {
    ctx.log(`  warn ${d.profileCode}: no location for city "${d.city}", service areas skipped`);
    return [];
  }
  const rows: Record<string, unknown>[] = [
    {
      tenant_id: ctx.hubTenantId,
      talent_profile_id: profileId,
      location_id: home,
      service_kind: "home_base",
      travel_radius_km: d.universal.travelRadiusKm && d.universal.travelRadiusKm > 0 ? d.universal.travelRadiusKm : null,
      travel_fee_required: d.universal.travelFeeRequired ?? false,
      notes: d.neighbourhood,
      display_order: 0,
    },
  ];
  const seen = new Set([home]);
  for (const city of d.universal.travelTo) {
    const id = findLocationId(ctx.locations, city, d.country);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      tenant_id: ctx.hubTenantId,
      talent_profile_id: profileId,
      location_id: id,
      service_kind: "travel_to",
      travel_radius_km: null,
      travel_fee_required: false,
      notes: null,
      display_order: rows.length,
    });
  }
  must(await ctx.admin.from("talent_service_areas").delete().eq("talent_profile_id", profileId), "talent_service_areas delete");
  const inserted = must(await ctx.admin.from("talent_service_areas").insert(rows).select("id"), "talent_service_areas insert") as
    | { id: string }[]
    | null;
  must(await ctx.admin.from("talent_profiles").update({ location_id: home }).eq("id", profileId), "location_id mirror");
  return (inserted ?? []).map((r) => r.id);
}

async function writeAvailability(ctx: SeedContext, d: FoundationDemo, profileId: string, existing: unknown) {
  const cells = buildAvailabilityCells(d, ctx.now);
  if (!cells.length) return;
  const cur = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  if (Array.isArray(cur.cells) && cur.cells.length > 0) return; // the person's own calendar wins
  const next = { vacation: null, recurring: { kind: "none" }, seasonalWindows: [], ...cur, cells };
  must(await ctx.admin.from("talent_profiles").update({ availability_data: next }).eq("id", profileId), "availability_data");
}

type ExistingProfile = {
  id: string;
  user_id: string | null;
  is_demo: boolean | null;
  booking_terms: unknown;
  selling_defaults: unknown;
  availability_data: unknown;
  public_slug_part: string | null;
};

/** Seed (create or update) one demo. Idempotent. */
export async function seedDemo(ctx: SeedContext, d: FoundationDemo): Promise<StatusEntry> {
  if (d.isLive && !ctx.includeLiveContent) return seedLiveMinimal(ctx, d);
  assertDemoIdentity(d);
  const { admin } = ctx;
  const nowIso = ctx.now.toISOString();

  const dataProblems = checkDemoData(d);
  if (dataProblems.length) throw new Error(`${d.profileCode}: ${dataProblems.join("; ")}`);
  const termId = ctx.termIds.get(d.talentTypeSlug);
  if (!termId) throw new Error(`taxonomy term not found: ${d.talentTypeSlug}. ${MIGRATION_HINT}`);
  const missing = new Set<string>();
  const fieldPlan = buildFieldValuePlan(d, ctx.fieldDefs);
  for (const k of fieldPlan.missingDefs) missing.add(k);
  if (missing.size) throw new Error(`${d.profileCode}: no field definition for ${[...missing].join(", ")}`);

  const userId = await ensureUser(admin, ctx.auth, d, ctx.password, !d.isLive || !!ctx.setLivePassword);

  // The auth-level profiles row (display name only for new demos).
  const profilePatch: Record<string, unknown> = {
    app_role: "talent",
    account_status: "active",
    onboarding_completed_at: nowIso,
    updated_at: nowIso,
  };
  if (!d.isLive) profilePatch.display_name = d.displayName;
  must(await admin.from("profiles").update(profilePatch).eq("id", userId), "profiles update");

  const existing = must(
    await admin
      .from("talent_profiles")
      .select("id, user_id, is_demo, booking_terms, selling_defaults, availability_data, public_slug_part")
      .eq("profile_code", d.profileCode)
      .maybeSingle(),
    "talent_profiles lookup",
  ) as ExistingProfile | null;
  if (existing?.user_id && existing.user_id !== userId) throw new Error(`${d.profileCode} linked to another user`);
  if (existing && existing.is_demo !== true) throw new Error(`REFUSE: ${d.profileCode} exists and is not a demo profile`);
  if (d.isLive && !existing) throw new Error(`REFUSE: live demo ${d.profileCode} has no profile row`);

  // The site row decides the slug: an existing site keeps its slug, live or not.
  type SiteRow = { id: string; site_slug: string | null; status: string | null; site_published_at: string | null };
  let existingSite = null as SiteRow | null;
  if (existing) {
    existingSite = must(
      await admin
        .from("talent_sites")
        .select("id, site_slug, status, site_published_at")
        .eq("talent_profile_id", existing.id)
        .maybeSingle(),
      "talent_sites lookup",
    ) as SiteRow | null;
  }
  const siteSlug = existingSite?.site_slug ?? (d.isLive ? d.siteSlug : existing?.public_slug_part ?? chooseSiteSlug(d, ctx.namespace));

  const offeringPlan = buildOfferingRows(d, "", ctx.hubTenantId, nowIso);
  const hours = deriveHours(d, offeringPlan.instantFlags);
  const patch = buildProfilePatch(d, {
    userId,
    nowIso,
    existingBookingTerms: existing?.booking_terms,
    existingSellingDefaults: existing?.selling_defaults,
    instantCount: offeringPlan.instantCount,
    hasHours: !!hours,
    servicesMenu: buildServicesMenu(offeringPlan.rows),
  });

  let profileId = existing?.id;
  if (profileId) {
    must(await admin.from("talent_profiles").update(patch).eq("id", profileId), "talent_profiles update");
  } else {
    const row = must(
      await admin
        .from("talent_profiles")
        .insert({ ...patch, profile_code: d.profileCode, public_slug_part: siteSlug })
        .select("id")
        .single(),
      "talent_profiles insert",
    ) as { id: string };
    profileId = row.id;
  }

  const entry: ManifestEntry = ctx.manifest.entries[d.profileCode] ?? {
    profileCode: d.profileCode,
    email: d.email,
    userId,
    talentProfileId: profileId,
    siteSlug,
    mediaAssetIds: [],
    storagePaths: [],
    photoSources: [],
    createdAt: nowIso,
    createdProfile: !existing,
  };
  entry.userId = userId;
  entry.talentProfileId = profileId;
  ctx.manifest.entries[d.profileCode] = entry;
  ctx.saveManifest();

  const offeringIds = await writeOfferings(ctx, profileId, offeringPlan.rows);
  entry.offeringIds = offeringIds;
  await linkOfferingPhotos(ctx, profileId, offeringIds);
  ctx.saveManifest();

  // One primary type; a different existing primary is replaced.
  must(
    await admin
      .from("talent_profile_taxonomy")
      .delete()
      .eq("talent_profile_id", profileId)
      .eq("relationship_type", "primary_role")
      .neq("taxonomy_term_id", termId),
    "talent_profile_taxonomy replace primary",
  );
  must(
    await admin.from("talent_profile_taxonomy").upsert(
      {
        talent_profile_id: profileId,
        taxonomy_term_id: termId,
        is_primary: true,
        relationship_type: "primary_role",
        display_order: 0,
        updated_at: nowIso,
      },
      { onConflict: "talent_profile_id,taxonomy_term_id" },
    ),
    "talent_profile_taxonomy upsert",
  );

  entry.fieldValueDefinitionIds = await writeFieldValues(ctx, profileId, fieldPlan);
  must(
    await admin.rpc("replace_talent_languages", {
      p_talent_profile_id: profileId,
      p_tenant_id: ctx.hubTenantId,
      p_rows: buildLanguageRows(d),
    }),
    "replace_talent_languages",
  );
  entry.languageCodes = buildLanguageRows(d).map((l) => l.language_code);

  if (hours) {
    must(
      await admin.from("talent_booking_hours").upsert(
        { talent_profile_id: profileId, tenant_id: ctx.hubTenantId, ...hours, updated_at: nowIso },
        { onConflict: "talent_profile_id" },
      ),
      "talent_booking_hours upsert",
    );
    entry.bookingHours = true;
  }
  await writeAvailability(ctx, d, profileId, existing?.availability_data);

  if (!d.isLive) {
    entry.serviceAreaIds = await writeServiceAreas(ctx, d, profileId);

    const roster = { tenant_id: ctx.hubTenantId, talent_profile_id: profileId, status: "active", agency_visibility: "site_visible", talent_site_hidden: false };
    const r = must(
      await admin.from("agency_talent_roster").select("id").eq("tenant_id", ctx.hubTenantId).eq("talent_profile_id", profileId).maybeSingle(),
      "agency_talent_roster lookup",
    ) as { id: string } | null;
    if (r?.id) must(await admin.from("agency_talent_roster").update(roster).eq("id", r.id), "agency_talent_roster update");
    else must(await admin.from("agency_talent_roster").insert(roster), "agency_talent_roster insert");

    // Draft site only, and only when the demo has none yet. A site that
    // exists (a theme applied, or later published) is never rewritten here.
    if (!existingSite) {
      const shell = buildDefaultShellTree({ displayName: d.displayName });
      const home = buildStarterHomePageTree({ displayName: d.displayName, tagline: d.localePrimary === "en" ? (d.taglineEn ?? d.tagline) : d.tagline });
      must(
        await admin.from("talent_sites").insert({
          talent_profile_id: profileId,
          site_kind: "talent_personal",
          status: "draft",
          site_slug: siteSlug,
          shell_tree: shell,
          version: 1,
          draft_updated_at: nowIso,
          updated_at: nowIso,
        }),
        "talent_sites insert",
      );
      entry.createdSite = true;
      const page = must(
        await admin.from("talent_pages").select("id").eq("talent_profile_id", profileId).eq("slug", "home").maybeSingle(),
        "talent_pages lookup",
      ) as { id: string } | null;
      if (!page) {
        must(
          await admin.from("talent_pages").insert({
            talent_profile_id: profileId,
            slug: "home",
            title: d.displayName,
            status: "draft",
            blocks: home,
            theme: {},
            is_home: true,
            sort_order: 0,
            nav_label: d.localePrimary === "en" ? "Home" : "Inicio",
            updated_at: nowIso,
          }),
          "talent_pages insert",
        );
      }
    }
  }
  entry.siteSlug = siteSlug;
  ctx.saveManifest();

  // Counts for status.json come from the database, not from what we meant to write.
  const photoRows = must(
    await admin.from("media_assets").select("id").eq("owner_talent_profile_id", profileId).is("deleted_at", null),
    "count photos",
  ) as { id: string }[] | null;
  const siteNow = must(
    await admin.from("talent_sites").select("status, site_published_at").eq("talent_profile_id", profileId).maybeSingle(),
    "site status",
  ) as { status: string | null; site_published_at: string | null } | null;

  const status: StatusEntry = {
    demo_id: d.demoId,
    code: d.profileCode,
    email: d.email,
    profile_id: profileId,
    site_slug: siteSlug,
    offerings: offeringIds.length,
    photos: photoRows?.length ?? 0,
    site_published: siteNow?.status === "published" || !!siteNow?.site_published_at,
    completeness: predictCompleteness(d).label,
    seeded_at: nowIso,
  };
  ctx.onStatus?.(status);
  ctx.log(
    `ok ${d.profileCode} ${d.displayName} ${profileId} slug ${siteSlug} offerings ${offeringIds.length} fields ${fieldPlan.values.length} photos ${status.photos} published ${status.site_published}`,
  );
  for (const n of offeringPlan.notes) ctx.log(`  note ${n}`);
  return status;
}

/**
 * What a live demo gets by default: nothing that was curated. Only field values
 * that have no value yet (never overwritten), bio_i18n.en when missing, and the
 * shared password when --set-live-password is passed. Offerings, services menu,
 * photos, booking hours, site, pages, roster, taxonomy and profile identity are
 * not read for writing.
 */
export async function seedLiveMinimal(ctx: SeedContext, d: FoundationDemo): Promise<StatusEntry> {
  assertDemoIdentity(d);
  const { admin } = ctx;
  const dataProblems = checkDemoData(d);
  if (dataProblems.length) throw new Error(`${d.profileCode}: ${dataProblems.join("; ")}`);
  const fieldPlan = buildFieldValuePlan(d, ctx.fieldDefs);
  if (fieldPlan.missingDefs.length) throw new Error(`${d.profileCode}: no field definition for ${fieldPlan.missingDefs.join(", ")}`);

  const user = checkDemoUser(ctx.auth, d.email);
  if (!user) throw new Error(`REFUSE: live demo ${d.profileCode} has no auth user (${d.email})`);
  if (ctx.setLivePassword) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: ctx.password });
    if (error) throw new Error(`auth password ${d.profileCode}: ${redact(error.message, [ctx.password])}`);
  }

  const tp = must(
    await admin.from("talent_profiles").select("id, user_id, is_demo, bio_i18n").eq("profile_code", d.profileCode).maybeSingle(),
    "talent_profiles lookup",
  ) as { id: string; user_id: string | null; is_demo: boolean | null; bio_i18n: Record<string, string> | null } | null;
  if (!tp) throw new Error(`REFUSE: live demo ${d.profileCode} has no profile row`);
  if (tp.is_demo !== true) throw new Error(`REFUSE: ${d.profileCode} exists and is not a demo profile`);
  if (tp.user_id !== user.id) throw new Error(`${d.profileCode} linked to another user`);

  const missing = await missingFieldValues(ctx, tp.id, fieldPlan);
  const rows = missing.map((v) => ({
    tenant_id: ctx.hubTenantId,
    talent_profile_id: tp.id,
    field_definition_id: ctx.fieldDefs.get(v.fieldKey)!.id,
    value: v.value,
    workflow_state: "live",
    last_edited_role: "platform",
  }));
  for (let i = 0; i < rows.length; i += 200) {
    must(await admin.from("talent_profile_field_values").insert(rows.slice(i, i + 200)), "talent_profile_field_values insert");
  }
  if (d.bioEn && !tp.bio_i18n?.en) {
    must(
      await admin.from("talent_profiles").update({ bio_i18n: { ...(tp.bio_i18n ?? {}), en: d.bioEn } }).eq("id", tp.id),
      "bio_i18n.en",
    );
  }

  const offerings = must(await admin.from("talent_offerings").select("id").eq("talent_profile_id", tp.id), "count offerings") as { id: string }[] | null;
  const photos = must(await admin.from("media_assets").select("id").eq("owner_talent_profile_id", tp.id).is("deleted_at", null), "count photos") as { id: string }[] | null;
  const site = must(await admin.from("talent_sites").select("site_slug, status, site_published_at").eq("talent_profile_id", tp.id).maybeSingle(), "site status") as
    | { site_slug: string | null; status: string | null; site_published_at: string | null }
    | null;
  const status: StatusEntry = {
    demo_id: d.demoId,
    code: d.profileCode,
    email: d.email,
    profile_id: tp.id,
    site_slug: site?.site_slug ?? d.siteSlug,
    offerings: offerings?.length ?? 0,
    photos: photos?.length ?? 0,
    site_published: site?.status === "published" || !!site?.site_published_at,
    completeness: predictCompleteness(d).label,
    seeded_at: ctx.now.toISOString(),
  };
  ctx.onStatus?.(status);
  ctx.log(`ok ${d.profileCode} LIVE (minimal): ${rows.length} missing field value(s) added, nothing else changed${ctx.setLivePassword ? ", password set" : ""}`);
  return status;
}

/** Planned values that have no row yet for this talent. */
async function missingFieldValues(ctx: Pick<SeedContext, "admin" | "fieldDefs">, profileId: string, plan: FieldPlan) {
  const ids = plan.values.map((v) => ctx.fieldDefs.get(v.fieldKey)?.id).filter((x): x is string => !!x);
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = must(
      await ctx.admin.from("talent_profile_field_values").select("field_definition_id").eq("talent_profile_id", profileId).in("field_definition_id", ids.slice(i, i + 100)),
      "talent_profile_field_values",
    ) as { field_definition_id: string }[] | null;
    for (const r of rows ?? []) have.add(r.field_definition_id);
  }
  return plan.values.filter((v) => !have.has(ctx.fieldDefs.get(v.fieldKey)!.id));
}

// ── Dry run ─────────────────────────────────────────────────────────────────

export type DemoReport = {
  code: string;
  demoId: string;
  name: string;
  live: boolean;
  problems: string[];
  warnings: string[];
  counts: PlannedCounts;
  slug: string;
  fieldValues: number;
  skippedFields: number;
};

/**
 * Read-only validation of one demo against the database, plus the row counts a
 * real run would write. Never writes; the caller passes a readOnly() client.
 */
export async function validateDemo(
  ctx: Pick<SeedContext, "admin" | "hubTenantId" | "termIds" | "fieldDefs" | "namespace" | "locations" | "auth" | "now"> & Partial<Pick<SeedContext, "includeLiveContent" | "setLivePassword">>,
  d: FoundationDemo,
): Promise<DemoReport> {
  const problems: string[] = [];
  const warnings: string[] = [];
  try {
    assertDemoIdentity(d);
  } catch (e) {
    problems.push((e as Error).message);
  }
  problems.push(...checkDemoData(d));
  warnings.push(...warnDemoData(d));
  if (!ctx.termIds.has(d.talentTypeSlug)) {
    problems.push(`taxonomy slug "${d.talentTypeSlug}" not found (${MIGRATION_HINT})`);
  }
  const fieldPlan = buildFieldValuePlan(d, ctx.fieldDefs);
  for (const k of fieldPlan.missingDefs) problems.push(`no field definition for ${k}`);
  for (const s of fieldPlan.skipped) {
    if (s.reason !== "empty" && s.reason !== "sensitive") warnings.push(`field ${s.key} skipped: ${s.reason}`);
  }

  let authUser: User | null = null;
  try {
    authUser = checkDemoUser(ctx.auth, d.email);
  } catch (e) {
    problems.push((e as Error).message);
  }
  if (d.isLive && !authUser) problems.push(`live demo has no auth user for ${d.email}`);

  const existing = must(
    await ctx.admin
      .from("talent_profiles")
      .select("id, user_id, is_demo, public_slug_part")
      .eq("profile_code", d.profileCode)
      .maybeSingle(),
    "talent_profiles lookup",
  ) as { id: string; user_id: string | null; is_demo: boolean | null; public_slug_part: string | null } | null;
  if (existing) {
    if (existing.is_demo !== true) problems.push(`${d.profileCode} exists and is not a demo profile`);
    if (existing.user_id && authUser && existing.user_id !== authUser.id) problems.push(`${d.profileCode} is linked to a different user`);
    if (existing.user_id && !authUser) problems.push(`${d.profileCode} is linked to a user that is not ${d.email}`);
  } else if (d.isLive) {
    problems.push(`live demo ${d.profileCode} has no profile row`);
  }

  type DrySite = { id: string; site_slug: string | null; status: string | null };
  let site = null as DrySite | null;
  if (existing) {
    site = must(
      await ctx.admin.from("talent_sites").select("id, site_slug, status").eq("talent_profile_id", existing.id).maybeSingle(),
      "talent_sites lookup",
    ) as DrySite | null;
  }
  const slug = site?.site_slug ?? (d.isLive ? d.siteSlug : existing?.public_slug_part ?? chooseSiteSlug(d, ctx.namespace));
  if (!d.isLive && !site && slug !== slugifySiteName(`${d.firstName} ${d.lastName}`)) {
    warnings.push(`slug ${slug} chosen because the plain name slug is taken`);
  }
  if (d.isLive && !site) warnings.push(`live demo ${d.profileCode} has no site row`);
  if (d.isLive && site?.site_slug && d.siteSlug && site.site_slug !== d.siteSlug) {
    warnings.push(`live site slug ${site.site_slug} differs from the export (${d.siteSlug}); the database value is kept`);
  }

  if (!d.isLive) {
    if (!findLocationId(ctx.locations, d.city, d.country)) warnings.push(`no location for city "${d.city}" (${d.country}); home base service area would be skipped`);
  }

  const offeringPlan = buildOfferingRows(d, "", ctx.hubTenantId, ctx.now.toISOString());
  warnings.push(...offeringPlan.notes);
  const hours = deriveHours(d, offeringPlan.instantFlags);
  const homeLoc = findLocationId(ctx.locations, d.city, d.country);
  const serviceAreas = d.isLive || !homeLoc
    ? 0
    : 1 + new Set(d.universal.travelTo.map((c) => findLocationId(ctx.locations, c, d.country)).filter((id) => id && id !== homeLoc)).size;
  let languages = 0;
  try {
    languages = buildLanguageRows(d).length;
  } catch (e) {
    problems.push((e as Error).message);
  }
  let counts = plannedCounts(d, fieldPlan, {
    offerings: offeringPlan.rows.length,
    languages,
    hasHours: !!hours,
    siteExists: !!site,
    serviceAreas,
    rosterExists: false,
  });
  let fieldValues = fieldPlan.values.length;
  if (d.isLive && !ctx.includeLiveContent) {
    // Default for a live demo: only missing field values and a missing English bio.
    let missing = fieldPlan.values.length;
    let bioEn = 0;
    if (existing) {
      missing = (await missingFieldValues(ctx, existing.id, fieldPlan)).length;
      const b = must(await ctx.admin.from("talent_profiles").select("bio_i18n").eq("id", existing.id).maybeSingle(), "talent_profiles bio") as { bio_i18n: Record<string, string> | null } | null;
      bioEn = d.bioEn && !b?.bio_i18n?.en ? 1 : 0;
    }
    fieldValues = missing;
    counts = {
      "auth.users (create/update + password)": ctx.setLivePassword ? 1 : 0,
      profiles: 0,
      talent_profiles: bioEn,
      talent_profile_taxonomy: 0,
      talent_offerings: 0,
      talent_profile_field_values: missing,
      talent_languages: 0,
      talent_booking_hours: 0,
      talent_service_areas: 0,
      agency_talent_roster: 0,
      talent_sites: 0,
      talent_pages: 0,
    };
    warnings.push("live demo: content untouched by default (offerings, menu, hours, site, photos, taxonomy)");
  }
  return {
    code: d.profileCode,
    demoId: d.demoId,
    name: d.displayName,
    live: d.isLive,
    problems,
    warnings,
    counts,
    slug,
    fieldValues,
    skippedFields: fieldPlan.skipped.length,
  };
}

// ── Remove ──────────────────────────────────────────────────────────────────

/**
 * Take demos this seeder created out of the database. Refuses the live demos
 * (they existed before this seeder and hold real photos and themes) and any
 * entry that does not match the database.
 */
export async function removeDemos(
  ctx: Pick<SeedContext, "admin" | "manifest" | "saveManifest" | "log">,
  codes: readonly string[],
  liveCodes: ReadonlySet<string>,
) {
  const { admin } = ctx;
  for (const code of codes) {
    if (liveCodes.has(code)) throw new Error(`REFUSE: ${code} is a live demo, not removable here`);
    const e = ctx.manifest.entries[code];
    if (!e) {
      ctx.log(`skip ${code}: not in the manifest`);
      continue;
    }
    assertDemoIdentity(e);
    const { data: u } = await admin.auth.admin.getUserById(e.userId);
    if (u.user && u.user.app_metadata?.demo_batch !== DEMO_BATCH) throw new Error(`REFUSE: ${e.email} is not a demo user`);
    const tp = must(
      await admin.from("talent_profiles").select("profile_code, user_id").eq("id", e.talentProfileId).maybeSingle(),
      "talent_profiles lookup",
    ) as { profile_code: string; user_id: string | null } | null;
    if (tp && (tp.profile_code !== e.profileCode || tp.user_id !== e.userId)) {
      throw new Error(`REFUSE: ${e.talentProfileId} does not match manifest`);
    }
    if (e.storagePaths.length) await admin.storage.from(BUCKET).remove(e.storagePaths);
    const id = e.talentProfileId;
    const steps: [string, PromiseLike<{ error: DbError }>][] = [
      ["talent_profile_field_values", admin.from("talent_profile_field_values").delete().eq("talent_profile_id", id)],
      ["talent_languages", admin.from("talent_languages").delete().eq("talent_profile_id", id)],
      ["talent_service_areas", admin.from("talent_service_areas").delete().eq("talent_profile_id", id)],
      ["media_assets", admin.from("media_assets").delete().eq("owner_talent_profile_id", id)],
      ["talent_booking_hours", admin.from("talent_booking_hours").delete().eq("talent_profile_id", id)],
      ["talent_offerings", admin.from("talent_offerings").delete().eq("talent_profile_id", id)],
      ["talent_pages", admin.from("talent_pages").delete().eq("talent_profile_id", id)],
      ["talent_site_revisions", admin.from("talent_site_revisions").delete().eq("talent_profile_id", id)],
      ["talent_sites", admin.from("talent_sites").delete().eq("talent_profile_id", id)],
      ["talent_profile_taxonomy", admin.from("talent_profile_taxonomy").delete().eq("talent_profile_id", id)],
      ["agency_talent_roster", admin.from("agency_talent_roster").delete().eq("talent_profile_id", id)],
    ];
    for (const [name, q] of steps) {
      const { error } = await q;
      if (error) ctx.log(`  warn ${code} ${name}: ${error.message}`);
    }
    const { error: delErr } = await admin.from("talent_profiles").delete().eq("id", id);
    if (delErr) {
      ctx.log(`  hard delete blocked, soft-deleting ${code}: ${delErr.message}`);
      await admin.from("talent_profiles").update({ deleted_at: new Date().toISOString(), is_publicly_hidden: true }).eq("id", id);
    }
    const { error: uErr } = await admin.auth.admin.deleteUser(e.userId);
    if (uErr) ctx.log(`  auth delete failed ${e.email}: ${uErr.message}`);
    delete ctx.manifest.entries[code];
    ctx.saveManifest();
    ctx.log(`removed ${code} ${e.email}`);
  }
}
