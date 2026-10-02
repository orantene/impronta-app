/**
 * Demo talent seed (Stream D). Creates the fictional demo talents in ./demos.ts
 * as complete free talents: auth user, profile, taxonomy, services, photos,
 * published one-page site. Modelled on scripts/seed-front-door-qa-fixtures.mts.
 *
 * Safety:
 *  - Refuses unless DEMO_SEED_TARGET_REF matches the project ref in
 *    NEXT_PUBLIC_SUPABASE_URL, so the target is always named explicitly.
 *  - No passwords. Sign in with a one-time magic link (--links).
 *  - Only touches rows it can prove are demo rows: profile codes TAL-93xxx
 *    whose auth user carries app_metadata.demo_batch = DEMO_BATCH and an
 *    @impronta.test or @demo.tulala.digital email. Anything else aborts.
 *  - Demo marker: auth app_metadata { demo: true, demo_batch }. The display
 *    name never says "demo".
 *  - Not listed in the public directory; no Stripe account is created.
 *  - Writes a manifest of every id it created (outside the repo, which is
 *    public) so --remove can take the batch out cleanly.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/seed.mts \
 *     --manifest <path.json> [--photos <pack.json>] [--only TAL-93001,TAL-93002]
 *   ... seed.mts --manifest <path.json> --links    # print magic links
 *   ... seed.mts --manifest <path.json> --remove   # delete the whole batch
 *
 * Photo pack JSON: { "TAL-93001": [ { "file": "/abs/path.jpg", "variant": "card"|"gallery"|"banner",
 *   "source": "https://unsplash.com/photos/..." , "alt": "..." } ] }
 *
 * A demo with a `photos` plan (Alba) reads `<key>.jpg` from --photo-dir instead
 * and also gets: service categories, options and extras, captions + service
 * links on its work photos, FAQ, demo reviews (from demo client users, shown
 * with a "Demo review" label), a home-base city and a change window.
 *   ... seed.mts --manifest <m.json> --only TAL-93020 --photo-dir <dir> \
 *       --password-env <path/.env.local>   # QA sign-in, written there, never printed
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../../src/lib/talent-site/default-max-site-trees";
import { resolveTalentTradePreset } from "../../src/lib/words/talent-trade-preset";
import { randomBytes } from "node:crypto";
import { DEMOS, DEMO_BATCH, type DemoTalent } from "./demos";
import { ALBA_PHOTO_SOURCES } from "./alba";
import { ALEX_PHOTO_SOURCES } from "./alex";
import { applyHeroFacts } from "../../src/lib/talent-site/demos/hero-facts";
import { isDemoEmail } from "./demo-identity";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const manifestPath = opt("--manifest");
const photoDir = opt("--photo-dir");
const passwordEnv = opt("--password-env");
if (!manifestPath) throw new Error("--manifest <path.json> is required");
if (path.resolve(manifestPath).startsWith(path.resolve(process.cwd(), ".."))) {
  throw new Error("REFUSE: keep the manifest outside the repo (the repo is public)");
}

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The platform hub differs per project; resolve it the way the hub
// auto-enroll trigger does instead of hardcoding the QA project's id.
async function resolveHubTenantId(): Promise<string> {
  const { data, error } = await admin
    .from("agencies")
    .select("id")
    .eq("kind", "hub")
    .eq("plan_tier", "network")
    .eq("status", "active");
  if (error) throw error;
  if (data?.length !== 1) throw new Error(`expected exactly one active hub, found ${data?.length ?? 0}`);
  return data[0].id as string;
}
let HUB_TENANT_ID = "";
const BUCKET = "media-public";

type ManifestEntry = {
  profileCode: string;
  email: string;
  userId: string;
  talentProfileId: string;
  siteSlug: string;
  mediaAssetIds: string[];
  storagePaths: string[];
  photoSources: string[];
  bookingHours?: boolean;
  /** Photo plan key -> media asset id (plan-based demos). */
  photoKeys?: Record<string, string>;
  /** Demo client users that wrote the demo reviews (removed with the batch). */
  reviewerUserIds?: string[];
  createdAt: string;
};
type PackPhoto = { file: string; variant: string; source: string; photographer?: string; alt?: string };
type Pack = Record<string, PackPhoto[]>;
type Manifest = { batch: string; targetRef: string; entries: Record<string, ManifestEntry> };

function loadManifest(): Manifest {
  if (fs.existsSync(manifestPath!)) {
    const m = JSON.parse(fs.readFileSync(manifestPath!, "utf8")) as Manifest;
    if (m.targetRef !== targetRef) throw new Error(`manifest is for ${m.targetRef}, not ${targetRef}`);
    return m;
  }
  return { batch: DEMO_BATCH, targetRef: targetRef!, entries: {} };
}
function saveManifest(m: Manifest) {
  fs.writeFileSync(manifestPath!, JSON.stringify(m, null, 2));
}

function assertDemoIdentity(d: Pick<DemoTalent, "profileCode" | "email">) {
  if (!/^TAL-93\d{3}$/.test(d.profileCode)) throw new Error(`not a demo code: ${d.profileCode}`);
  if (!isDemoEmail(d.email)) throw new Error(`not a demo email: ${d.email}`);
}

async function getAuthUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function ensureUser(d: DemoTalent) {
  const appMeta = { demo: true, demo_batch: DEMO_BATCH };
  const existing = await getAuthUserByEmail(d.email);
  if (existing) {
    if (existing.app_metadata?.demo_batch !== DEMO_BATCH) {
      throw new Error(`REFUSE: ${d.email} exists and is not a ${DEMO_BATCH} demo user`);
    }
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: { full_name: d.displayName },
      app_metadata: appMeta,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    email_confirm: true,
    user_metadata: { full_name: d.displayName },
    app_metadata: appMeta,
  });
  if (error) throw error;
  return data.user!.id;
}

function servicesMenu(d: DemoTalent) {
  let instantSeen = false;
  return d.services.map((s, i) => {
    const instant = s.booking === "instant" && !instantSeen;
    if (instant) instantSeen = true;
    return {
      id: randomUUID(),
      name: s.name,
      description: s.description,
      pricingType: s.booking === "quote" ? "custom" : s.pricingType,
      amountCents: s.booking === "quote" || s.amountMxn == null ? null : s.amountMxn * 100,
      currency: "MXN",
      taxonomyTermIds: null,
      addOns: [],
      tiers: [],
      isActive: true,
      visibility: "public",
      sortOrder: i,
      isInstantBook: instant,
      childServiceIds: null,
    };
  });
}

// Public site services come from talent_offerings (not services_menu). Demo
// offerings reserve for free: no deposit, no card, never a real charge.
async function writeOfferings(d: DemoTalent, profileId: string) {
  const { error: delErr } = await admin.from("talent_offerings").delete().eq("talent_profile_id", profileId);
  if (delErr) throw delErr;
  const now = new Date().toISOString();
  const rows = d.services.map((s, i) => ({
    talent_profile_id: profileId,
    tenant_id: HUB_TENANT_ID,
    kind: "service",
    title: s.name,
    description: s.description,
    title_i18n: { es: s.name },
    description_i18n: { es: s.description },
    price_type: s.booking === "quote" ? "custom" : s.pricingType,
    price_display: s.booking === "quote" || s.amountMxn == null ? "quote" : "exact",
    amount_cents: s.booking === "quote" || s.amountMxn == null ? null : s.amountMxn * 100,
    currency: "MXN",
    booking_mode: s.booking === "instant" ? "instant" : "request",
    reserve_mode: "free",
    allow_pay_in_person: true,
    duration_minutes: s.durationMin,
    ...(s.category ? { category: s.category } : {}),
    ...(s.cancellationHours != null ? { cancellation_hours: s.cancellationHours } : {}),
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    is_featured: i < 2,
    sort_order: i,
    owner_kind: "talent",
    first_published_at: now,
    attributes: { demo_batch: DEMO_BATCH, ...(s.priceUnit ? { price_unit: s.priceUnit } : {}) },
  }));
  const { data: inserted, error } = await admin.from("talent_offerings").insert(rows).select("id, sort_order");
  if (error) throw error;
  const idBySort = new Map((inserted ?? []).map((r) => [r.sort_order as number, r.id as string]));
  const variants = d.services.flatMap((s, i) =>
    (s.variants ?? []).map((v, j) => ({ offering_id: idBySort.get(i), label: v.label, amount_cents: v.priceMxn * 100, sort_order: j })),
  );
  const addons = d.services.flatMap((s, i) =>
    (s.extras ?? []).map((x, j) => ({ offering_id: idBySort.get(i), label: x.label, amount_cents: x.priceMxn * 100, sort_order: j })),
  );
  if (variants.length) {
    const { error: vErr } = await admin.from("talent_offering_variants").insert(variants);
    if (vErr) throw vErr;
  }
  if (addons.length) {
    const { error: aErr } = await admin.from("talent_offering_addons").insert(addons);
    if (aErr) throw aErr;
  }
}

// Plan-based photos (Alba): headshot as `card` first, then the work strip in
// order (caption in metadata), then the rest. Sources are the proposal's
// Unsplash picks.
async function uploadPlanPhotos(d: DemoTalent, profileId: string, userId: string, dir: string, entry: ManifestEntry, manifest: Manifest) {
  const plan = d.photos!;
  if (entry.photoKeys && Object.keys(entry.photoKeys).length) {
    console.log("  plan photos already uploaded, skipping", d.profileCode);
    return;
  }
  entry.photoKeys = {};
  const list: { key: string; variant: string; caption?: string }[] = [
    { key: plan.headshot, variant: "card" },
    ...plan.work.map((w) => ({ key: w.key, variant: "gallery", caption: w.caption })),
    ...plan.more.filter((k) => !plan.work.some((w) => w.key === k)).map((k) => ({ key: k, variant: "gallery" })),
  ];
  for (const [i, p] of list.entries()) {
    const file = path.join(dir, `${p.key}.jpg`);
    const source = ALBA_PHOTO_SOURCES[p.key] ?? ALEX_PHOTO_SOURCES[p.key];
    if (!source) throw new Error(`no source recorded for photo ${p.key}`);
    const body = fs.readFileSync(file);
    const storagePath = `tenant/${HUB_TENANT_ID}/talent/${profileId}/${randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, body, { contentType: "image/jpeg" });
    if (upErr) throw upErr;
    entry.storagePaths.push(storagePath);
    saveManifest(manifest);
    const { data, error } = await admin
      .from("media_assets")
      .insert({
        tenant_id: HUB_TENANT_ID,
        owner_talent_profile_id: profileId,
        bucket_id: BUCKET,
        storage_path: storagePath,
        variant_kind: p.variant,
        approval_state: "approved",
        purpose: "talent",
        sort_order: i,
        file_size: body.length,
        mime_type: "image/jpeg",
        alt: plan.alt?.[p.key] ?? p.caption ?? d.displayName,
        attribution_note: `Unsplash · ${source}`,
        metadata: { source, demo_batch: DEMO_BATCH, ...(p.caption ? { caption: p.caption } : {}) },
        ownership_kind: "talent",
        owner_tenant_id: null,
        uploaded_by_user_id: userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    entry.mediaAssetIds.push(data.id);
    entry.photoSources.push(source);
    entry.photoKeys[p.key] = data.id;
    saveManifest(manifest);
  }
}

// Each service's own thumbnail first, then the work shots that link to it
// ("Quiero esto" on the strip opens that service).
async function linkPlanPhotos(d: DemoTalent, profileId: string, entry: ManifestEntry) {
  const keys = entry.photoKeys ?? {};
  const { data: offers, error } = await admin
    .from("talent_offerings")
    .select("id, sort_order")
    .eq("talent_profile_id", profileId)
    .order("sort_order");
  if (error) throw error;
  const byIndex = new Map((offers ?? []).map((o) => [o.sort_order as number, o.id as string]));
  const rows: { offering_id: string; media_asset_id: string; sort_order: number }[] = [];
  d.services.forEach((s, i) => {
    const oid = byIndex.get(i);
    const mid = s.photo ? keys[s.photo] : undefined;
    if (oid && mid) rows.push({ offering_id: oid, media_asset_id: mid, sort_order: 0 });
  });
  for (const w of d.photos?.work ?? []) {
    const oid = w.service != null ? byIndex.get(w.service) : undefined;
    const mid = keys[w.key];
    if (oid && mid && !rows.some((r) => r.offering_id === oid && r.media_asset_id === mid)) {
      rows.push({ offering_id: oid, media_asset_id: mid, sort_order: 1 });
    }
  }
  if (rows.length) {
    const { error: lErr } = await admin.from("talent_offering_media").insert(rows);
    if (lErr) throw lErr;
  }
}

// Private checklist fields (last name, phone, gender, birth date, where she
// lives and is from) so the profile reads 100% complete.
async function completeProfile(d: DemoTalent, profileId: string) {
  if (!d.profile) return;
  const slug = d.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const [{ data: loc }, { data: mx }] = await Promise.all([
    admin.from("locations").select("id").eq("country_code", "MX").eq("city_slug", slug).is("archived_at", null).maybeSingle(),
    admin.from("countries").select("id").eq("iso2", "MX").maybeSingle(),
  ]);
  const { error } = await admin
    .from("talent_profiles")
    .update({
      last_name: d.profile.lastName,
      phone: d.profile.phone,
      gender: d.profile.gender,
      date_of_birth: d.profile.dateOfBirth,
      ...(loc?.id ? { location_id: loc.id, residence_city_id: loc.id, origin_city_id: loc.id } : {}),
      ...(mx?.id ? { origin_country_id: mx.id } : {}),
    })
    .eq("id", profileId);
  if (error) throw error;
  if (!loc?.id) console.warn("  no location row for", d.city, "(lives in / from left empty)");
}

async function writeFaq(d: DemoTalent, profileId: string) {
  if (!d.faq?.length) return;
  const { error: delErr } = await admin.from("talent_faq_items").delete().eq("talent_profile_id", profileId);
  if (delErr) throw delErr;
  const { error } = await admin.from("talent_faq_items").insert(
    d.faq.map((f, i) => ({ talent_profile_id: profileId, question: f.q, answer: f.a, status: "published", sort_order: i })),
  );
  if (error) throw error;
}

// Demo reviews come from demo client users (@impronta.test, demo_batch). The
// site labels every card "Demo review" because the talent is_demo.
async function writeReviews(d: DemoTalent, profileId: string, entry: ManifestEntry) {
  if (!d.reviews?.length) return;
  const { error: delErr } = await admin.from("talent_reviews").delete().eq("talent_profile_id", profileId);
  if (delErr) throw delErr;
  entry.reviewerUserIds = entry.reviewerUserIds ?? [];
  const base = Date.now();
  for (const [i, r] of d.reviews.entries()) {
    const reviewer: DemoTalent = { ...d, email: d.email.replace("@", `-cliente-${i + 1}@`), displayName: r.name };
    assertDemoIdentity(reviewer);
    const uid = await ensureUser(reviewer);
    if (!entry.reviewerUserIds.includes(uid)) entry.reviewerUserIds.push(uid);
    await admin.from("profiles").update({ display_name: r.name }).eq("id", uid);
    const { error } = await admin.from("talent_reviews").insert({
      tenant_id: HUB_TENANT_ID,
      talent_profile_id: profileId,
      client_user_id: uid,
      rating: 5,
      body: r.body,
      status: "published",
      // First review in the list is the newest.
      created_at: new Date(base - i * 86_400_000).toISOString(),
    });
    if (error) throw error;
  }
}

async function writeHomeBase(d: DemoTalent, profileId: string) {
  if (!d.photos) return;
  const slug = d.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const { data: loc } = await admin
    .from("locations")
    .select("id")
    .eq("country_code", "MX")
    .eq("city_slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (!loc?.id) {
    console.warn("  no location row for", d.city, "(home base skipped)");
    return;
  }
  const { error: delErr } = await admin
    .from("talent_service_areas")
    .delete()
    .eq("talent_profile_id", profileId)
    .eq("service_kind", "home_base");
  if (delErr) throw delErr;
  const { error } = await admin.from("talent_service_areas").insert({
    tenant_id: HUB_TENANT_ID,
    talent_profile_id: profileId,
    location_id: loc.id,
    service_kind: "home_base",
    display_order: 0,
  });
  if (error) throw error;
}

// QA sign-in for ONE demo: a random password set on the demo user and written
// to the given env file as QA_<NAME>_PASSWORD. Never printed.
async function setQaPassword(d: DemoTalent, userId: string, envFile: string) {
  const password = randomBytes(18).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw error;
  const key = `QA_${d.displayName.split(" ")[0]!.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()}_PASSWORD`;
  const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const lines = text.split("\n").filter((l) => !l.startsWith(`${key}=`));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.push(`${key}=${password}`, "");
  fs.writeFileSync(envFile, lines.join("\n"), { mode: 0o600 });
  console.log("  QA password set; written to", envFile, "as", key);
}

// Working hours so instant services show real time slots. Bookings are still
// refused server-side by the is_demo guard: the visitor can pick a time, the
// submit shows the demo message.
async function writeBookingHours(d: DemoTalent, profileId: string, entry: ManifestEntry) {
  if (!d.hours) return;
  const weekly: Record<string, { startMin: number; endMin: number }[]> = {};
  for (let day = 0; day < 7; day += 1) {
    weekly[String(day)] = d.hours.days.includes(day) ? [{ startMin: d.hours.startMin, endMin: d.hours.endMin }] : [];
  }
  const { error } = await admin.from("talent_booking_hours").upsert(
    {
      talent_profile_id: profileId,
      tenant_id: HUB_TENANT_ID,
      timezone: d.hours.timezone,
      weekly,
      exceptions: [],
      slot_minutes: d.hours.slotMinutes,
      buffer_before_min: 0,
      buffer_after_min: 15,
      min_notice_min: 120,
      horizon_days: 60,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id" },
  );
  if (error) throw error;
  entry.bookingHours = true;
}

// The Location section's settings (zone only for demos: no address is stored).
async function writeLocationSettings(d: DemoTalent, profileId: string) {
  if (!d.location) return;
  const { error } = await admin.from("talent_location_settings").upsert(
    {
      talent_profile_id: profileId,
      address_mode: d.location.addressMode,
      studio_kind: d.location.studioKind,
      zone_neighbourhood: d.location.neighbourhood,
      arrival_note: d.location.arrivalNote,
      arrival_photo_url: null,
      exact_address: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id" },
  );
  if (error) throw error;
}

// One of the demo's own gallery photos per service card (by order).
async function linkOfferingPhotos(profileId: string) {
  const { data: offers, error: oErr } = await admin
    .from("talent_offerings")
    .select("id")
    .eq("talent_profile_id", profileId)
    .order("sort_order");
  if (oErr) throw oErr;
  const { data: photos, error: pErr } = await admin
    .from("media_assets")
    .select("id")
    .eq("owner_talent_profile_id", profileId)
    .eq("variant_kind", "gallery")
    .is("deleted_at", null)
    .order("sort_order");
  if (pErr) throw pErr;
  if (!offers?.length || !photos?.length) return;
  const rows = offers.map((o, i) => ({ offering_id: o.id, media_asset_id: photos[i % photos.length].id, sort_order: 0 }));
  const { error } = await admin.from("talent_offering_media").insert(rows);
  if (error) throw error;
}

async function termId(slug: string) {
  const { data, error } = await admin.from("taxonomy_terms").select("id")
    .eq("slug", slug)
    .eq("kind", "talent_type")
    .eq("is_active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`taxonomy term not found: ${slug}`);
  return data.id as string;
}

async function uploadPhotos(
  d: DemoTalent,
  profileId: string,
  userId: string,
  photos: PackPhoto[],
  entry: ManifestEntry,
  manifest: Manifest,
) {
  if (entry.mediaAssetIds.length === photos.length) {
    console.log("  photos already uploaded, skipping", d.profileCode);
    return;
  }
  const order: Record<string, number> = {};
  for (const p of photos) {
    if (!p.source) throw new Error(`photo without source for ${d.profileCode}: ${p.file}`);
    const ext = path.extname(p.file).slice(1).toLowerCase() || "jpg";
    const storagePath = `tenant/${HUB_TENANT_ID}/talent/${profileId}/${randomUUID()}.${ext}`;
    const body = fs.readFileSync(p.file);
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, body, { contentType: mime });
    if (upErr) throw upErr;
    entry.storagePaths.push(storagePath);
    saveManifest(manifest);
    const sortOrder = (order[p.variant] = (order[p.variant] ?? -1) + 1);
    const { data, error } = await admin
      .from("media_assets")
      .insert({
        tenant_id: HUB_TENANT_ID,
        owner_talent_profile_id: profileId,
        bucket_id: BUCKET,
        storage_path: storagePath,
        variant_kind: p.variant,
        approval_state: "approved",
        purpose: "talent",
        sort_order: sortOrder,
        file_size: body.length,
        mime_type: mime,
        alt: p.alt ?? d.displayName,
        attribution_note: p.photographer ? `${p.photographer} · ${p.source}` : p.source,
        metadata: { source: p.source, photographer: p.photographer ?? null, demo_batch: DEMO_BATCH },
        ownership_kind: "talent",
        owner_tenant_id: null,
        uploaded_by_user_id: userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    entry.mediaAssetIds.push(data.id);
    entry.photoSources.push(p.source);
  }
}

async function seedOne(d: DemoTalent, manifest: Manifest, pack: Pack | null) {
  assertDemoIdentity(d);
  const preset = await resolveTalentTradePreset(admin, d.serviceCategorySlug);
  const userId = await ensureUser(d);
  const now = new Date().toISOString();

  const { error: pErr } = await admin
    .from("profiles")
    .update({ display_name: d.displayName, app_role: "talent", account_status: "active", onboarding_completed_at: now, updated_at: now })
    .eq("id", userId);
  if (pErr) throw pErr;

  const { data: existing } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .eq("profile_code", d.profileCode)
    .maybeSingle();
  if (existing?.user_id && existing.user_id !== userId) throw new Error(`${d.profileCode} linked to another user`);

  const patch = {
    display_name: d.displayName,
    first_name: d.displayName.split(" ")[0],
    last_name: d.displayName.split(" ").slice(1).join(" ") || null,
    profile_kind: "person",
    is_demo: true,
    // Instant services need the talent-level direct-booking opt-in, as a real
    // talent sets it in Settings; without it the slots API answers inquiry_only.
    booking_terms: d.hours ? { directBookingOptIn: true } : null,
    short_bio: d.tagline,
    bio_i18n: { es: d.bio },
    home_city_text: d.city,
    home_country_text: "México",
    preferred_locale: "es",
    default_currency: "MXN",
    talent_plan_key: "talent_portfolio",
    workflow_status: "approved",
    visibility: "public",
    is_publicly_listed: false,
    is_discoverable: false,
    is_publicly_hidden: false,
    service_category_slug: d.serviceCategorySlug,
    services_menu: servicesMenu(d),
    user_id: userId,
    deleted_at: null,
    updated_at: now,
  };
  let profileId = existing?.id as string | undefined;
  if (profileId) {
    const { error } = await admin.from("talent_profiles").update(patch).eq("id", profileId);
    if (error) throw error;
  } else {
    const { data, error } = await admin
      .from("talent_profiles")
      .insert({ ...patch, profile_code: d.profileCode, public_slug_part: d.siteSlug })
      .select("id")
      .single();
    if (error) throw error;
    profileId = data.id as string;
  }

  const entry: ManifestEntry = manifest.entries[d.profileCode] ?? {
    profileCode: d.profileCode,
    email: d.email,
    userId,
    talentProfileId: profileId,
    siteSlug: d.siteSlug,
    mediaAssetIds: [],
    storagePaths: [],
    photoSources: [],
    createdAt: now,
  };
  manifest.entries[d.profileCode] = entry;
  saveManifest(manifest);

  await writeOfferings(d, profileId);

  const tid = await termId(d.talentTypeSlug);
  const { error: txErr } = await admin
    .from("talent_profile_taxonomy")
    .upsert({ talent_profile_id: profileId, taxonomy_term_id: tid, is_primary: true, relationship_type: "primary_role", display_order: 0, updated_at: now }, { onConflict: "talent_profile_id,taxonomy_term_id" });
  if (txErr) throw txErr;

  if (d.photos) {
    if (!photoDir) throw new Error(`${d.profileCode} has a photo plan: --photo-dir <dir> is required`);
    await uploadPlanPhotos(d, profileId, userId, photoDir, entry, manifest);
    await linkPlanPhotos(d, profileId, entry);
  } else {
    if (pack?.[d.profileCode]?.length) {
      await uploadPhotos(d, profileId, userId, pack[d.profileCode], entry, manifest);
      saveManifest(manifest);
    }
    await linkOfferingPhotos(profileId);
  }
  await completeProfile(d, profileId);
  await writeFaq(d, profileId);
  await writeReviews(d, profileId, entry);
  await writeHomeBase(d, profileId);
  // Release 2.7: headline, years, languages and Instagram the hero and footer read from the profile.
  await applyHeroFacts(admin, { profileCode: d.profileCode, hubTenantId: HUB_TENANT_ID, write: true });
  if (passwordEnv) await setQaPassword(d, userId, passwordEnv);
  await writeBookingHours(d, profileId, entry);
  await writeLocationSettings(d, profileId);
  saveManifest(manifest);

  const shell = buildDefaultShellTree({ displayName: d.displayName });
  const home = buildStarterHomePageTree({ displayName: d.displayName, tagline: d.tagline });
  const { error: siteErr } = await admin.from("talent_sites").upsert(
    {
      talent_profile_id: profileId,
      site_kind: "talent_personal",
      status: "published",
      site_slug: d.siteSlug,
      shell_tree: shell,
      shell_published: shell,
      published_at: now,
      site_published_at: now,
      version: 1,
      draft_updated_at: now,
      updated_at: now,
    },
    { onConflict: "talent_profile_id" },
  );
  if (siteErr) throw siteErr;
  const { error: pageErr } = await admin.from("talent_pages").upsert(
    { talent_profile_id: profileId, slug: "home", title: d.displayName, status: "published", blocks: home, theme: {}, is_home: true, sort_order: 0, nav_label: "Inicio", published_at: now, updated_at: now },
    { onConflict: "talent_profile_id,slug" },
  );
  if (pageErr) throw pageErr;

  const roster = { tenant_id: HUB_TENANT_ID, talent_profile_id: profileId, status: "active", agency_visibility: "site_visible", talent_site_hidden: false };
  const { data: r } = await admin.from("agency_talent_roster").select("id").eq("tenant_id", HUB_TENANT_ID).eq("talent_profile_id", profileId).maybeSingle();
  const { error: rErr } = r?.id
    ? await admin.from("agency_talent_roster").update(roster).eq("id", r.id)
    : await admin.from("agency_talent_roster").insert(roster);
  if (rErr) throw rErr;

  const { data: lookup, error: lErr } = await admin.rpc("talent_site_subdomain_lookup", { p_slug: d.siteSlug });
  if (lErr) throw lErr;
  console.log("ok", d.profileCode, d.displayName, profileId, `${d.siteSlug}.tulala.digital`, "preset", preset, "photos", entry.mediaAssetIds.length, "lookup", JSON.stringify(lookup));
}

async function printLinks(manifest: Manifest) {
  for (const e of Object.values(manifest.entries)) {
    assertDemoIdentity(e);
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: e.email });
    if (error) throw error;
    console.log(e.profileCode, e.email, data.properties.action_link);
  }
}

async function removeBatch(manifest: Manifest) {
  for (const e of Object.values(manifest.entries)) {
    assertDemoIdentity(e);
    const { data: u } = await admin.auth.admin.getUserById(e.userId);
    if (u.user && u.user.app_metadata?.demo_batch !== DEMO_BATCH) throw new Error(`REFUSE: ${e.email} is not a demo user`);
    const { data: tp } = await admin.from("talent_profiles").select("profile_code,user_id").eq("id", e.talentProfileId).maybeSingle();
    if (tp && (tp.profile_code !== e.profileCode || tp.user_id !== e.userId)) throw new Error(`REFUSE: ${e.talentProfileId} does not match manifest`);

    if (e.storagePaths.length) await admin.storage.from(BUCKET).remove(e.storagePaths);
    const steps: [string, PromiseLike<{ error: unknown }>][] = [
      ["media_assets", admin.from("media_assets").delete().eq("owner_talent_profile_id", e.talentProfileId)],
      ["talent_booking_hours", admin.from("talent_booking_hours").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_location_settings", admin.from("talent_location_settings").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_offerings", admin.from("talent_offerings").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_reviews", admin.from("talent_reviews").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_faq_items", admin.from("talent_faq_items").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_service_areas", admin.from("talent_service_areas").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_pages", admin.from("talent_pages").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_site_revisions", admin.from("talent_site_revisions").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_sites", admin.from("talent_sites").delete().eq("talent_profile_id", e.talentProfileId)],
      ["talent_profile_taxonomy", admin.from("talent_profile_taxonomy").delete().eq("talent_profile_id", e.talentProfileId)],
      ["agency_talent_roster", admin.from("agency_talent_roster").delete().eq("talent_profile_id", e.talentProfileId)],
    ];
    for (const [name, q] of steps) {
      const { error } = await q;
      if (error) console.warn("  warn", e.profileCode, name, (error as { message?: string }).message);
    }
    const { error: delErr } = await admin.from("talent_profiles").delete().eq("id", e.talentProfileId);
    if (delErr) {
      console.warn("  hard delete blocked, soft-deleting", e.profileCode, delErr.message);
      await admin.from("talent_profiles").update({ deleted_at: new Date().toISOString(), is_publicly_hidden: true }).eq("id", e.talentProfileId);
    }
    const { error: uErr } = await admin.auth.admin.deleteUser(e.userId);
    if (uErr) console.warn("  auth delete failed", e.email, uErr.message);
    for (const rid of e.reviewerUserIds ?? []) {
      const { data: ru } = await admin.auth.admin.getUserById(rid);
      if (ru.user && ru.user.app_metadata?.demo_batch !== DEMO_BATCH) continue;
      const { error: rErr } = await admin.auth.admin.deleteUser(rid);
      if (rErr) console.warn("  reviewer delete failed", rid, rErr.message);
    }
    delete manifest.entries[e.profileCode];
    saveManifest(manifest);
    console.log("removed", e.profileCode, e.email);
  }
}

const manifest = loadManifest();
HUB_TENANT_ID = await resolveHubTenantId();
if (flag("--links")) {
  await printLinks(manifest);
} else if (flag("--remove")) {
  await removeBatch(manifest);
} else {
  const only = opt("--only")?.split(",");
  if (passwordEnv && only?.length !== 1) throw new Error("--password-env needs exactly one --only demo");
  const packPath = opt("--photos");
  const pack = packPath ? (JSON.parse(fs.readFileSync(packPath, "utf8")) as Pack) : null;
  for (const d of DEMOS.filter((x) => !only || only.includes(x.profileCode))) {
    await seedOne(d, manifest, pack);
  }
  console.log("done; manifest:", manifestPath);
}
