/**
 * Photos-only loader for the Demo Foundation talents (PHOTO-PLAN.md).
 *
 * Writes ONLY: storage objects in media-public, media_assets rows, the
 * albums.list field value (when the demo has none) and talent_offering_media
 * links. It never touches offerings content, services_menu, bio, other profile
 * fields, the site, hours or auth. (load-pack.mts does all of that; do not use
 * it for foundation demos.)
 *
 * Every function takes the Supabase client as an argument so the tests drive it
 * with the in-memory fake and a dry run drives it with a read-only client. With
 * `write: false` nothing here calls a mutating method.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEMO_BATCH } from "./demos";
import { DEMO_CODE_RE, isDemoEmail } from "./demo-identity";
import { BUCKET, type Manifest } from "./foundation-seed-core";

type Admin = SupabaseClient;
type DbError = { message: string } | null;
type Row = Record<string, unknown>;

function must<T>(res: { data: T; error: DbError }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

// ── Pack ────────────────────────────────────────────────────────────────────

export const PHOTO_VARIANTS = ["card", "hero", "gallery", "polaroid"] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];
export const POLAROID_SLOTS = ["p-front", "p-side", "p-back", "p-smile", "p-no-makeup"] as const;
export const IMAGE_EXTS: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const MIN_GALLERY = 3;

export type PackPhoto = {
  file: string;
  variant: PhotoVariant;
  alt: string;
  tag?: string;
  source: string;
  photographer?: string;
  polaroidSlot?: string;
};
export type PhotoPack = Record<string, { photos: PackPhoto[] }>;

/** Live demos (TAL-93001..93010) and the Jor clone are refused unless --include-live. */
export function isLiveDemoCode(code: string): boolean {
  const m = /^TAL-93(\d{3})$/.exec(code);
  if (!m) return false;
  const n = Number(m[1]);
  return (n >= 1 && n <= 10) || n === 900;
}

export type PackCheck = { problems: string[]; warnings: string[] };

/** Pure-ish validation of one demo's photo list. `exists` is injectable for tests. */
export function validatePhotos(
  code: string,
  photos: readonly PackPhoto[] | undefined,
  opts: { strict?: boolean; exists?: (file: string) => boolean } = {},
): PackCheck {
  const exists = opts.exists ?? ((f: string) => fs.existsSync(f));
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!DEMO_CODE_RE.test(code)) problems.push(`not a demo code: ${code}`);
  if (!Array.isArray(photos) || photos.length === 0) {
    problems.push("no photos in the pack");
    return { problems, warnings };
  }
  const count: Record<string, number> = {};
  photos.forEach((p, i) => {
    const at = `photo ${i + 1} (${p?.file ?? "?"})`;
    if (!p || typeof p.file !== "string" || !p.file) return void problems.push(`${at}: file is required`);
    const ext = path.extname(p.file).slice(1).toLowerCase();
    if (!IMAGE_EXTS[ext]) problems.push(`${at}: extension must be jpg, jpeg, png or webp`);
    else if (!exists(p.file)) problems.push(`${at}: file does not exist`);
    if (!PHOTO_VARIANTS.includes(p.variant)) problems.push(`${at}: variant must be card, hero, gallery or polaroid`);
    else count[p.variant] = (count[p.variant] ?? 0) + 1;
    if (typeof p.source !== "string" || !p.source.trim()) problems.push(`${at}: source is required`);
    if (p.variant === "polaroid" && !POLAROID_SLOTS.includes(p.polaroidSlot as (typeof POLAROID_SLOTS)[number])) {
      problems.push(`${at}: polaroidSlot must be one of ${POLAROID_SLOTS.join(", ")}`);
    }
  });
  if ((count.card ?? 0) > 1) problems.push(`at most 1 card photo (found ${count.card})`);
  if ((count.hero ?? 0) > 1) problems.push(`at most 1 hero photo (found ${count.hero})`);
  const gallery = count.gallery ?? 0;
  if (gallery < MIN_GALLERY) {
    const msg = `${gallery} gallery photo(s); the profile drawer needs at least ${MIN_GALLERY}`;
    if (opts.strict) problems.push(msg);
    else warnings.push(msg);
  }
  return { problems, warnings };
}

// ── Context ─────────────────────────────────────────────────────────────────

export type PhotoCtx = {
  admin: Admin;
  hubTenantId: string;
  /** field_definitions.id of albums.list; null when the definition is missing. */
  albumsFieldId: string | null;
  manifest: Manifest;
  saveManifest: () => void;
  log: (line: string) => void;
  write: boolean;
  replace?: boolean;
  includeLive?: boolean;
  strict?: boolean;
  readFile?: (file: string) => Buffer;
  exists?: (file: string) => boolean;
};

export type PlannedPhoto = { variant: PhotoVariant; file: string; action: "upload" | "skip" };
export type PhotoResult = {
  code: string;
  planned: PlannedPhoto[];
  replacedIds: string[];
  uploaded: number;
  albumsWritten: boolean;
  linksWritten: number;
  warnings: string[];
};

type MediaRow = { id: string; variant_kind: string; storage_path: string; metadata: Row | null; approval_state?: string; deleted_at?: string | null };

const isBatchRow = (r: MediaRow) => !!r.metadata && typeof r.metadata === "object" && !!(r.metadata as Row).demo_batch;

// ── One demo ────────────────────────────────────────────────────────────────

/** Guards, plan, and (when ctx.write) the writes for one demo. */
export async function loadDemoPhotos(ctx: PhotoCtx, code: string, photos: readonly PackPhoto[]): Promise<PhotoResult> {
  const { admin } = ctx;
  const check = validatePhotos(code, photos, { strict: ctx.strict, exists: ctx.exists });
  if (check.problems.length) throw new Error(`REFUSE ${code}: ${check.problems.join("; ")}`);
  if (isLiveDemoCode(code) && !ctx.includeLive) {
    throw new Error(`REFUSE: ${code} is a live demo or the Jor clone (pass --include-live to load photos onto it)`);
  }
  const entry = ctx.manifest.entries[code];
  if (!entry) throw new Error(`REFUSE: ${code} is not in the manifest`);

  const tp = must(
    await admin.from("talent_profiles").select("id, profile_code, is_demo, user_id").eq("id", entry.talentProfileId).maybeSingle(),
    "talent_profiles lookup",
  ) as { id: string; profile_code: string; is_demo: boolean; user_id: string | null } | null;
  if (!tp) throw new Error(`REFUSE: ${code} has no talent_profiles row ${entry.talentProfileId}`);
  if (tp.is_demo !== true || tp.profile_code !== code || tp.user_id !== entry.userId) {
    throw new Error(`REFUSE: ${entry.talentProfileId} is not the demo ${code} (is_demo, code or user mismatch)`);
  }
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(entry.userId);
  if (uErr) throw new Error(`auth.getUserById ${code}: ${uErr.message}`);
  if (!u.user || !u.user.app_metadata?.demo_batch) throw new Error(`REFUSE: auth user of ${code} has no app_metadata.demo_batch`);
  if (!isDemoEmail(u.user.email ?? "")) throw new Error(`REFUSE: ${code} auth email is not on a demo domain`);

  const profileId = tp.id;
  const existing = (must(
    await admin
      .from("media_assets")
      .select("id, variant_kind, storage_path, metadata, approval_state, deleted_at")
      .eq("owner_talent_profile_id", profileId)
      .is("deleted_at", null),
    "media_assets lookup",
  ) as MediaRow[] | null ?? []).filter((r) => r.approval_state === undefined || r.approval_state === "approved");
  const batchRows = existing.filter(isBatchRow);

  const packVariants = new Set(photos.map((p) => p.variant));
  const doomed = ctx.replace ? batchRows.filter((r) => packVariants.has(r.variant_kind as PhotoVariant)) : [];
  const doomedIds = new Set(doomed.map((r) => r.id));
  const keptVariants = new Set(batchRows.filter((r) => !doomedIds.has(r.id)).map((r) => r.variant_kind));

  const planned: PlannedPhoto[] = photos.map((p) => ({
    variant: p.variant,
    file: p.file,
    action: keptVariants.has(p.variant) ? "skip" : "upload",
  }));
  const warnings = [...check.warnings];
  const result: PhotoResult = { code, planned, replacedIds: doomed.map((r) => r.id), uploaded: 0, albumsWritten: false, linksWritten: 0, warnings };

  const readFile = ctx.readFile ?? ((f: string) => fs.readFileSync(f));
  const tenantId = ctx.hubTenantId;
  const nowIso = new Date().toISOString();

  // Read side of albums and links, needed for the plan as well as the write.
  let albumsMissing = false;
  if (ctx.albumsFieldId) {
    const v = must(
      await admin.from("talent_profile_field_values").select("id").eq("talent_profile_id", profileId).eq("field_definition_id", ctx.albumsFieldId).maybeSingle(),
      "albums.list lookup",
    );
    albumsMissing = !v;
  } else if (planned.some((p) => p.variant === "gallery")) {
    warnings.push("albums.list field definition not found; the album value will not be written");
  }
  const willHaveGallery = planned.some((p) => p.variant === "gallery" && p.action === "upload") || existing.some((r) => r.variant_kind === "gallery" && !doomedIds.has(r.id));
  const writeAlbums = albumsMissing && willHaveGallery;

  if (!ctx.write) {
    for (const p of planned) ctx.log(`  ${p.action === "upload" ? "would upload" : "skip (already loaded; --replace to redo)"} ${p.variant} ${p.file}`);
    if (doomed.length) ctx.log(`  would soft-delete ${doomed.length} previous demo-batch row(s) and remove their storage objects`);
    if (writeAlbums) ctx.log("  would set albums.list = [Main]");
    return result;
  }

  // Replace: soft-delete the previous set and remove its storage objects.
  if (doomed.length) {
    const ids = doomed.map((r) => r.id);
    const paths = doomed.map((r) => r.storage_path);
    const offerings = must(await admin.from("talent_offerings").select("id").eq("talent_profile_id", profileId), "talent_offerings lookup") as { id: string }[] | null ?? [];
    if (offerings.length) {
      must(await admin.from("talent_offering_media").delete().in("offering_id", offerings.map((o) => o.id)).in("media_asset_id", ids), "talent_offering_media unlink");
    }
    must(await admin.from("media_assets").update({ deleted_at: nowIso }).in("id", ids), "media_assets soft-delete");
    const { error } = await admin.storage.from(BUCKET).remove(paths);
    if (error) ctx.log(`  warn ${code}: storage remove failed: ${error.message}`);
    entry.mediaAssetIds = entry.mediaAssetIds.filter((x) => !ids.includes(x));
    entry.storagePaths = entry.storagePaths.filter((x) => !paths.includes(x));
    ctx.saveManifest();
  }

  const order: Record<string, number> = {};
  for (const p of photos) {
    const sortOrder = (order[p.variant] = (order[p.variant] ?? -1) + 1);
    if (keptVariants.has(p.variant)) continue;
    const ext = path.extname(p.file).slice(1).toLowerCase();
    const mime = IMAGE_EXTS[ext];
    const body = readFile(p.file);
    const storagePath = `tenant/${tenantId}/talent/${profileId}/${randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, body, { contentType: mime });
    if (upErr) throw new Error(`storage upload ${code} ${p.file}: ${upErr.message}`);
    entry.storagePaths.push(storagePath);
    ctx.saveManifest();
    const metadata: Row = { source: p.source, photographer: p.photographer ?? null, demo_batch: DEMO_BATCH };
    if (p.variant === "gallery") metadata.albumId = "main";
    if (p.variant === "polaroid") metadata.polaroidSlot = p.polaroidSlot;
    const row = must(
      await admin
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
          mime_type: mime,
          alt: p.alt,
          tags: p.tag ? [p.tag] : [],
          attribution_note: p.photographer ? `${p.photographer} · ${p.source}` : p.source,
          metadata,
          ownership_kind: "talent",
          owner_tenant_id: null,
          uploaded_by_user_id: entry.userId,
          created_by: entry.userId,
        })
        .select("id")
        .single(),
      `media_assets insert ${code}`,
    ) as { id: string };
    entry.mediaAssetIds.push(row.id);
    entry.photoSources.push(p.source);
    result.uploaded += 1;
    ctx.saveManifest();
  }

  if (writeAlbums && ctx.albumsFieldId) {
    must(
      await admin.from("talent_profile_field_values").upsert(
        {
          tenant_id: tenantId,
          talent_profile_id: profileId,
          field_definition_id: ctx.albumsFieldId,
          value: [{ id: "main", name: "Main", sortOrder: 0 }],
          workflow_state: "live",
          last_edited_role: "platform",
        },
        { onConflict: "talent_profile_id,field_definition_id" },
      ),
      "albums.list upsert",
    );
    result.albumsWritten = true;
  }

  result.linksWritten = await linkGalleryToOfferings(ctx, profileId);
  ctx.log(`  ${code}: uploaded ${result.uploaded}, replaced ${result.replacedIds.length}, albums ${result.albumsWritten ? "set" : "kept"}, offering links ${result.linksWritten}`);
  return result;
}

/** One gallery photo per offering, round robin; offerings that already have a link are left alone. */
async function linkGalleryToOfferings(ctx: PhotoCtx, profileId: string): Promise<number> {
  const { admin } = ctx;
  const offerings = (must(await admin.from("talent_offerings").select("id, sort_order").eq("talent_profile_id", profileId).order("sort_order"), "talent_offerings lookup") as { id: string }[] | null) ?? [];
  if (!offerings.length) return 0;
  const gallery = (must(
    await admin.from("media_assets").select("id").eq("owner_talent_profile_id", profileId).eq("variant_kind", "gallery").is("deleted_at", null).order("sort_order"),
    "media_assets(gallery)",
  ) as { id: string }[] | null) ?? [];
  if (!gallery.length) return 0;
  const linked = new Set(
    ((must(await admin.from("talent_offering_media").select("offering_id").in("offering_id", offerings.map((o) => o.id)), "talent_offering_media lookup") as { offering_id: string }[] | null) ?? []).map((l) => l.offering_id),
  );
  const links = offerings
    .map((o, i) => ({ offering_id: o.id, media_asset_id: gallery[i % gallery.length].id, sort_order: 0 }))
    .filter((l) => !linked.has(l.offering_id));
  if (links.length) must(await admin.from("talent_offering_media").insert(links), "talent_offering_media insert");
  return links.length;
}

/** Run every selected demo; a refusal on one demo stops the run before it writes anything for that demo. */
export async function loadAllPhotos(ctx: PhotoCtx, pack: PhotoPack, only?: readonly string[]): Promise<PhotoResult[]> {
  const codes = Object.keys(pack).filter((c) => !only || only.includes(c));
  if (only) for (const c of only) if (!(c in pack)) throw new Error(`--only ${c}: not in the pack`);
  // Validate and guard everything read-only first so a bad entry writes nothing for any demo.
  const dry: PhotoCtx = { ...ctx, write: false, log: () => {} };
  for (const c of codes) await loadDemoPhotos(dry, c, pack[c].photos);
  const out: PhotoResult[] = [];
  for (const c of codes) {
    ctx.log(`\n${c}${ctx.write ? "" : " (dry run)"}`);
    out.push(await loadDemoPhotos(ctx, c, pack[c].photos));
  }
  return out;
}
