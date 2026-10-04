/**
 * QA clone of Jor's live site (stream A): a demo talent that looks like
 * book-jorgelina today, so design changes are QA'd on the clone before
 * anything touches Jor's draft.
 *
 * READ-ONLY on Jor: every query against her rows is a select. The clone gets
 * NEW rows (profile, offerings + variants + add-ons, media rows that point at
 * the SAME storage files, booking hours, site, pages). Personal fields (date of
 * birth, nationality, phone, social links, legal name) are not copied. Offering,
 * variant, add-on and media ids inside the site trees are remapped to the
 * clone's own rows.
 *
 * The clone is a demo (is_demo, app_metadata.demo_batch, TAL-93900,
 * @impronta.test), not in the directory, and logged in the seed manifest with
 * NO storage paths, so `seed.mts --remove` deletes the clone's rows but never
 * Jor's files. Profile id is pinned (`CLONE.profileId`) so Vercel allow-lists
 * like `TALENT_MAISON_THEME_TALENTS` survive cleanup/reseed.
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> \
 *     scripts/demo-talents/clone-jor.mts --manifest <path.json>
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { DEMO_BATCH } from "./demos";

const JOR_PROFILE_ID = "f048e578-cbae-45db-9a3b-34239abea136";
const CLONE = {
  /** Stable across seed --remove + re-clone; keep in sync with Maison allow-list. */
  profileId: "c99f8adb-8ebb-4aad-911a-897e73efd369",
  profileCode: "TAL-93900",
  email: "demo-jor-clone@impronta.test",
  siteSlug: "jorg-beauty-qa",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const args = process.argv.slice(2);
const mi = args.indexOf("--manifest");
const manifestPath = mi >= 0 ? args[mi + 1] : undefined;
if (!manifestPath) throw new Error("--manifest <path.json> is required");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = Record<string, unknown>;
async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}
const now = new Date().toISOString();

// ── Read Jor (select only) ────────────────────────────────────────────────
const jor = await must<Row>(admin.from("talent_profiles").select("*").eq("id", JOR_PROFILE_ID).single(), "read jor");
if (jor.is_demo === true) throw new Error("REFUSE: source is a demo, expected Jor's real profile");
const jorOffers = await must<Row[]>(admin.from("talent_offerings").select("*").eq("talent_profile_id", JOR_PROFILE_ID).order("sort_order"), "read offerings");
const offerIds = jorOffers.map((o) => o.id as string);
const jorVariants = await must<Row[]>(admin.from("talent_offering_variants").select("*").in("offering_id", offerIds), "read variants");
const jorAddons = await must<Row[]>(admin.from("talent_offering_addons").select("*").in("offering_id", offerIds), "read addons");
const jorOfferMedia = await must<Row[]>(admin.from("talent_offering_media").select("*").in("offering_id", offerIds), "read offering media");
const jorMedia = await must<Row[]>(admin.from("media_assets").select("*").eq("owner_talent_profile_id", JOR_PROFILE_ID).is("deleted_at", null), "read media");
const jorHours = await must<Row | null>(admin.from("talent_booking_hours").select("*").eq("talent_profile_id", JOR_PROFILE_ID).maybeSingle(), "read hours");
const jorSite = await must<Row>(admin.from("talent_sites").select("*").eq("talent_profile_id", JOR_PROFILE_ID).single(), "read site");
const jorPages = await must<Row[]>(admin.from("talent_pages").select("*").eq("talent_profile_id", JOR_PROFILE_ID), "read pages");
const jorRoster = await must<Row | null>(
  admin.from("agency_talent_roster").select("tenant_id").eq("talent_profile_id", JOR_PROFILE_ID).eq("status", "active").limit(1).maybeSingle(),
  "read roster",
);
const tenantId = (jorOffers[0]?.tenant_id as string | undefined) ?? (jorRoster?.tenant_id as string);
console.log(`read Jor: ${jorOffers.length} offerings, ${jorVariants.length} variants, ${jorAddons.length} add-ons, ${jorMedia.length} photos, ${jorPages.length} pages`);

// ── Manifest + refuse to overwrite anything that is not our clone ────────────
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  targetRef: string;
  entries: Record<string, Row>;
};
if (manifest.targetRef !== targetRef) throw new Error(`manifest is for ${manifest.targetRef}`);

async function findUser(email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
}
let user = await findUser(CLONE.email);
if (user && user.app_metadata?.demo_batch !== DEMO_BATCH) throw new Error("REFUSE: clone email belongs to a non-demo user");
if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: CLONE.email,
    email_confirm: true,
    user_metadata: { full_name: jor.display_name },
    app_metadata: { demo: true, demo_batch: DEMO_BATCH, clone_of: "jor" },
  });
  if (error) throw error;
  user = data.user!;
}
const userId = user.id;
await must(admin.from("profiles").update({ display_name: jor.display_name, app_role: "talent", account_status: "active", onboarding_completed_at: now }).eq("id", userId).select("id"), "profiles");

// ── Profile ─────────────────────────────────────────────────────────────────
const COPY_FIELDS = [
  "display_name", "first_name", "short_bio", "intro_italic", "event_styles", "destinations", "languages",
  "team_size", "lead_time_weeks", "starting_from", "booking_note", "package_teasers", "service_category_slug",
  "talent_plan_key", "home_city_text", "home_country_text", "pronunciation", "availability_data", "remote_only",
  "travel_radius_km", "travel_fee_required", "default_currency", "booking_terms", "preferred_locale", "bio_i18n",
  "profile_kind", "category_order", "selling_defaults", "services_menu", "contact_policy",
] as const;
const profilePatch: Row = Object.fromEntries(COPY_FIELDS.map((k) => [k, jor[k] ?? null]));
Object.assign(profilePatch, {
  user_id: userId,
  is_demo: true,
  workflow_status: "approved",
  visibility: "public",
  is_publicly_listed: false,
  is_discoverable: false,
  is_publicly_hidden: false,
  published_globally: false,
  deleted_at: null,
  updated_at: now,
});
const existing = await must<Row | null>(admin.from("talent_profiles").select("id, user_id").eq("profile_code", CLONE.profileCode).maybeSingle(), "find clone");
if (existing && existing.user_id !== userId) throw new Error("REFUSE: TAL-93900 linked to another user");
if (existing && existing.id !== CLONE.profileId) {
  throw new Error(
    `REFUSE: TAL-93900 id is ${existing.id}, expected stable ${CLONE.profileId}; run seed --remove then re-clone`,
  );
}
let cloneId: string;
if (existing) {
  cloneId = existing.id as string;
  await must(admin.from("talent_profiles").update(profilePatch).eq("id", cloneId).select("id"), "update clone");
  // Re-clone: clear the clone's own children first (never Jor's).
  await must(admin.from("talent_offerings").delete().eq("talent_profile_id", cloneId).select("id"), "clear offerings");
  await must(admin.from("media_assets").delete().eq("owner_talent_profile_id", cloneId).select("id"), "clear media");
} else {
  const row = await must<Row>(
    admin
      .from("talent_profiles")
      .insert({
        ...profilePatch,
        id: CLONE.profileId,
        profile_code: CLONE.profileCode,
        public_slug_part: CLONE.siteSlug,
      })
      .select("id")
      .single(),
    "insert clone",
  );
  cloneId = row.id as string;
}
if (cloneId === JOR_PROFILE_ID) throw new Error("REFUSE: clone id equals Jor");

manifest.entries[CLONE.profileCode] = {
  profileCode: CLONE.profileCode,
  email: CLONE.email,
  userId,
  talentProfileId: cloneId,
  siteSlug: CLONE.siteSlug,
  mediaAssetIds: [],
  storagePaths: [], // shared with Jor: never delete these files
  photoSources: ["clone of Jor's own photos (same storage files)"],
  bookingHours: Boolean(jorHours),
  createdAt: now,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// ── Id map for everything the trees might reference ──────────────────────────
const idMap = new Map<string, string>();
const newId = (old: unknown) => {
  const n = randomUUID();
  idMap.set(old as string, n);
  return n;
};

// Media rows: new ids, same storage files.
const mediaRows = jorMedia.map((m) => {
  const { id, created_at, updated_at, ...rest } = m;
  void created_at; void updated_at;
  return { ...rest, id: newId(id), owner_talent_profile_id: cloneId, uploaded_by_user_id: userId, created_by: userId, metadata: { ...(m.metadata as Row | null ?? {}), clone_of_media: id, demo_batch: DEMO_BATCH } };
});
if (mediaRows.length) await must(admin.from("media_assets").insert(mediaRows).select("id"), "insert media");
(manifest.entries[CLONE.profileCode].mediaAssetIds as string[]).push(...mediaRows.map((m) => m.id as string));

const offerRows = jorOffers.map((o) => {
  const { id, created_at, updated_at, first_published_at, import_batch_id, capacity_pool_id, ...rest } = o;
  void created_at; void updated_at; void first_published_at; void import_batch_id; void capacity_pool_id;
  return { ...rest, id: newId(id), talent_profile_id: cloneId, first_published_at: now };
});
if (offerRows.length) await must(admin.from("talent_offerings").insert(offerRows).select("id"), "insert offerings");

const variantRows = jorVariants.map((v) => {
  const { id, created_at, updated_at, capacity_pool_id, space_group_id, ...rest } = v;
  void created_at; void updated_at; void capacity_pool_id; void space_group_id;
  return { ...rest, id: newId(id), offering_id: idMap.get(v.offering_id as string) };
});
if (variantRows.length) await must(admin.from("talent_offering_variants").insert(variantRows).select("id"), "insert variants");

const addonRows = jorAddons.map((a) => {
  const { id, created_at, updated_at, addon_group_id, ...rest } = a;
  void created_at; void updated_at; void addon_group_id;
  return {
    ...rest,
    id: newId(id),
    offering_id: idMap.get(a.offering_id as string),
    media_asset_id: a.media_asset_id ? idMap.get(a.media_asset_id as string) ?? null : null,
  };
});
if (addonRows.length) await must(admin.from("talent_offering_addons").insert(addonRows).select("id"), "insert addons");

const omRows = jorOfferMedia
  .filter((r) => idMap.has(r.media_asset_id as string))
  .map((r) => ({ offering_id: idMap.get(r.offering_id as string), media_asset_id: idMap.get(r.media_asset_id as string), sort_order: r.sort_order }));
if (omRows.length) await must(admin.from("talent_offering_media").insert(omRows).select("offering_id"), "insert offering media");

if (jorHours) {
  const { created_at, updated_at, ...rest } = jorHours;
  void created_at; void updated_at;
  await must(admin.from("talent_booking_hours").upsert({ ...rest, talent_profile_id: cloneId, updated_at: now }, { onConflict: "talent_profile_id" }).select("talent_profile_id"), "hours");
}

// Hub roster (same shape the seed uses), so the clone's site resolves a seller.
const roster = { tenant_id: tenantId, talent_profile_id: cloneId, status: "active", agency_visibility: "site_visible", talent_site_hidden: false, direct_booking_enabled: true };
const r = await must<Row | null>(admin.from("agency_talent_roster").select("id").eq("tenant_id", tenantId).eq("talent_profile_id", cloneId).maybeSingle(), "find roster");
if (r?.id) await must(admin.from("agency_talent_roster").update(roster).eq("id", r.id as string).select("id"), "roster");
else await must(admin.from("agency_talent_roster").insert(roster).select("id"), "roster");

// ── Site + pages: Jor's CURRENT design, ids remapped ─────────────────────────
function remap<T>(value: T): T {
  if (value == null) return value;
  let s = JSON.stringify(value);
  for (const [from, to] of idMap) s = s.split(from).join(to);
  return JSON.parse(s) as T;
}
const {
  id: _siteId, talent_profile_id: _tp, site_slug: _slug, created_at: _c, updated_at: _u,
  created_by: _cb, updated_by: _ub, pending_design: _pd, ...siteRest
} = jorSite;
void _siteId; void _tp; void _slug; void _c; void _u; void _cb; void _ub; void _pd;
const sitePatch: Row = {};
for (const [k, v] of Object.entries(siteRest)) sitePatch[k] = typeof v === "object" ? remap(v) : v;
Object.assign(sitePatch, {
  talent_profile_id: cloneId,
  site_slug: CLONE.siteSlug,
  status: "published",
  pending_design: null,
  created_by: userId,
  updated_by: userId,
  updated_at: now,
});
await must(admin.from("talent_sites").upsert(sitePatch, { onConflict: "talent_profile_id" }).select("id"), "site");

await must(admin.from("talent_pages").delete().eq("talent_profile_id", cloneId).select("id"), "clear pages");
const pageRows = jorPages.map((p) => {
  const { id, created_at, updated_at, ...rest } = p;
  void id; void created_at; void updated_at;
  const out: Row = {};
  for (const [k, v] of Object.entries(rest)) out[k] = typeof v === "object" ? remap(v) : v;
  return { ...out, talent_profile_id: cloneId, updated_at: now };
});
if (pageRows.length) await must(admin.from("talent_pages").insert(pageRows).select("id"), "pages");

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const demoHostSlug = `${CLONE.siteSlug}-demo`;
const { data: lookup } = await admin.rpc("talent_site_subdomain_lookup", { p_slug: demoHostSlug });
console.log("clone", CLONE.profileCode, cloneId, `https://${demoHostSlug}.tulala.digital`, `offerings ${offerRows.length} variants ${variantRows.length} addons ${addonRows.length} media ${mediaRows.length} pages ${pageRows.length}`, "lookup", JSON.stringify(lookup));
