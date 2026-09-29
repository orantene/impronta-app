/**
 * Load a design-session content pack onto ONE demo talent (replacing its
 * photos, services and bio), then run apply-maison.mts to republish.
 *
 * Pack shape: { "<TAL-93xxx>": { photos: [{file, variant, chapter, source,
 * photographer, alt}], comp_card: {...}, services: [{name, category, mode,
 * price_mxn, price_type, duration_min, note}], bio_es } }
 *
 * Demo rows only (TAL-93xxx + is_demo, checked). Old demo photos listed in
 * the manifest are deleted from storage; new ones are logged. Chapters land in
 * media_assets.tags + metadata.chapter and in the offerings' category.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=<env> scripts/demo-talents/load-pack.mts \
 *     --manifest <path.json> --pack <pack.json> --code TAL-93004 [--focal "50% 25%"]
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as demosMod from "./demos";

function namedFromCjs<T extends object>(mod: T | { default: T }): T {
  if (mod && typeof mod === "object" && "default" in mod) {
    const d = (mod as { default: unknown }).default;
    if (d && typeof d === "object") return d as T;
  }
  return mod as T;
}
const { DEMO_BATCH } = namedFromCjs(demosMod as typeof import("./demos"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const manifestPath = opt("--manifest");
const packPath = opt("--pack");
const code = opt("--code");
if (!manifestPath || !packPath || !code) throw new Error("--manifest, --pack and --code are required");
if (!/^TAL-93\d{3}$/.test(code)) throw new Error(`REFUSE: not a demo code ${code}`);

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = "media-public";

type PackPhoto = { file: string; variant: string; chapter: string | null; source: string; photographer?: string; alt: string };
type PackService = { name: string; category: string; mode: "request" | "quote" | "instant"; price_mxn: number; price_type: "fixed" | "from"; duration_min: number; note: string };
type Pack = { photos: PackPhoto[]; comp_card: Record<string, unknown>; services: PackService[]; bio_es: string };

// Internal authoring notes ("Regla del dueño: ...") never reach the public site.
const cleanNote = (n: string) => n.replace(/\s*Regla del due[nñ]o:[^.]*\.?/gi, "").trim();
const pack = (JSON.parse(fs.readFileSync(packPath, "utf8")) as Record<string, Pack>)[code];
if (!pack) throw new Error(`no pack for ${code}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
  targetRef: string;
  entries: Record<string, { talentProfileId: string; userId: string; mediaAssetIds: string[]; storagePaths: string[]; photoSources: string[] }>;
};
if (manifest.targetRef !== targetRef) throw new Error("manifest target mismatch");
const entry = manifest.entries[code];
if (!entry) throw new Error(`${code} not in manifest`);
const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const { data: tp, error: tpErr } = await admin
  .from("talent_profiles")
  .select("id, profile_code, is_demo, user_id, first_name")
  .eq("id", entry.talentProfileId)
  .single();
if (tpErr) throw tpErr;
if (tp.profile_code !== code || tp.is_demo !== true || tp.user_id !== entry.userId) throw new Error("REFUSE: manifest row is not this demo");
const profileId = tp.id as string;

// Tenant: the one the demo's existing offerings/roster use.
const { data: roster } = await admin.from("agency_talent_roster").select("tenant_id").eq("talent_profile_id", profileId).limit(1).single();
const tenantId = roster!.tenant_id as string;

// ── Photos: remove the old demo set, upload the pack ─────────────────────────
for (const p of pack.photos) if (!p.source) throw new Error(`photo without source: ${p.file}`);
if (entry.storagePaths.length) await admin.storage.from(BUCKET).remove(entry.storagePaths);
await admin.from("media_assets").delete().eq("owner_talent_profile_id", profileId);
entry.mediaAssetIds = [];
entry.storagePaths = [];
entry.photoSources = [];
save();

const order: Record<string, number> = {};
const galleryIds: string[] = [];
let bannerPath = "";
for (const p of pack.photos) {
  const ext = path.extname(p.file).slice(1).toLowerCase() || "jpg";
  const storagePath = `tenant/${tenantId}/talent/${profileId}/${randomUUID()}.${ext}`;
  const body = fs.readFileSync(p.file);
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, body, { contentType: ext === "png" ? "image/png" : "image/jpeg" });
  if (upErr) throw upErr;
  entry.storagePaths.push(storagePath);
  save();
  if (p.variant === "banner") bannerPath = storagePath;
  const sortOrder = (order[p.variant] = (order[p.variant] ?? -1) + 1);
  const { data, error } = await admin
    .from("media_assets")
    .insert({
      tenant_id: tenantId,
      owner_talent_profile_id: profileId,
      bucket_id: BUCKET,
      storage_path: storagePath,
      variant_kind: p.variant,
      approval_state: "approved",
      purpose: "talent",
      sort_order: sortOrder,
      file_size: body.length,
      mime_type: "image/jpeg",
      alt: p.alt,
      tags: p.chapter ? [p.chapter] : [],
      attribution_note: p.photographer ? `${p.photographer} · ${p.source}` : p.source,
      metadata: { source: p.source, photographer: p.photographer ?? null, chapter: p.chapter, demo_batch: DEMO_BATCH },
      ownership_kind: "talent",
      owner_tenant_id: null,
      uploaded_by_user_id: entry.userId,
      created_by: entry.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  entry.mediaAssetIds.push(data.id);
  entry.photoSources.push(p.source);
  if (p.variant === "gallery") galleryIds.push(data.id);
  save();
}

// ── Services: offerings (site) + services_menu (profile), chapters as categories ──
await admin.from("talent_offerings").delete().eq("talent_profile_id", profileId);
const nowIso = new Date().toISOString();
const offerRows = pack.services.map((s, i) => ({
  talent_profile_id: profileId,
  tenant_id: tenantId,
  kind: "service",
  title: s.name,
  description: cleanNote(s.note),
  title_i18n: { es: s.name },
  description_i18n: { es: cleanNote(s.note) },
  category: s.category,
  price_type: s.mode === "quote" ? "custom" : "flat_package",
  price_display: s.mode === "quote" ? "quote" : s.price_type === "from" ? "from" : "exact",
  // A quote shows no amount (else the ≈US$ line appears next to "Cotización").
  amount_cents: s.mode === "quote" ? null : s.price_mxn * 100,
  currency: "MXN",
  booking_mode: s.mode === "instant" ? "instant" : "request",
  reserve_mode: "free",
  allow_pay_in_person: true,
  duration_minutes: s.duration_min,
  status: "published",
  visibility: "public",
  moderation_state: "approved",
  is_featured: i < 2,
  sort_order: i,
  owner_kind: "talent",
  first_published_at: nowIso,
  attributes: { demo_batch: DEMO_BATCH },
}));
const { data: offers, error: oErr } = await admin.from("talent_offerings").insert(offerRows).select("id, sort_order");
if (oErr) throw oErr;
const links = (offers ?? [])
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((o, i) => ({ offering_id: o.id, media_asset_id: galleryIds[(i * 5) % galleryIds.length], sort_order: 0 }));
if (links.length) {
  const { error } = await admin.from("talent_offering_media").insert(links);
  if (error) throw error;
}

// ── Bio + comp card facts ─────────────────────────────────────────────────────
const cc = pack.comp_card;
const facts = [
  `Estatura ${cc.height_cm} cm`,
  `Medidas ${cc.bust_cm}-${cc.waist_cm}-${cc.hips_cm}`,
  `Calzado ${cc.shoe_mx} MX`,
  `Cabello ${String(cc.hair).toLowerCase()}`,
  `Ojos ${String(cc.eyes).toLowerCase()}`,
].join(" · ");
const { error: pErr } = await admin
  .from("talent_profiles")
  .update({
    bio_i18n: { es: pack.bio_es },
    short_bio: facts,
    height_cm: cc.height_cm,
    home_city_text: cc.city,
    languages: cc.languages,
    services_menu: pack.services.map((s, i) => ({
      id: randomUUID(),
      name: s.name,
      description: cleanNote(s.note),
      pricingType: s.mode === "quote" ? "custom" : "flat_package",
      amountCents: s.mode === "quote" ? null : s.price_mxn * 100,
      currency: "MXN",
      taxonomyTermIds: null,
      addOns: [],
      tiers: [],
      isActive: true,
      visibility: "public",
      sortOrder: i,
      isInstantBook: s.mode === "instant",
      childServiceIds: null,
    })),
    updated_at: nowIso,
  })
  .eq("id", profileId)
  .eq("is_demo", true);
if (pErr) throw pErr;

fs.writeFileSync(`${manifestPath}.${code}.banner`, bannerPath);
console.log("pack", code, `photos ${entry.mediaAssetIds.length} (gallery ${galleryIds.length})`, `services ${offerRows.length}`, "banner", bannerPath);
