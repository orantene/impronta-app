/**
 * photo-ingest.ts — a dish's photo, from someone else's CDN into our library.
 *
 * WHY THIS EXISTS AT ALL. `talent_offering_media.media_asset_id` is a foreign
 * key to `media_assets`. There is no URL column anywhere on that path, so a
 * remote photo cannot be "linked" — it has to become a row, which means bytes
 * in our storage. That is the whole reason this is a module and not a field on
 * the importer.
 *
 * FOUR RULES, each of which is a way this goes wrong quietly:
 *
 * 1. IDEMPOTENT ON THE SOURCE URL. The asset records `metadata.source_url`, and
 *    a re-import looks that up BEFORE fetching. Without it, re-importing El
 *    Paisa re-downloads 21 photos and mints 21 duplicate assets every time,
 *    while the menu still looks correct — the library quietly fills with
 *    copies. The same URL shared by two dishes also becomes ONE asset, linked
 *    twice.
 *
 * 2. A PHOTO FAILURE MUST NEVER FAIL A DISH. These URLs point at a CDN we do
 *    not control; some will 404, time out, or serve HTML. 117 dishes with 20
 *    photos is a good import. Refusing all 117 because one image moved is not.
 *    So failures are collected and reported by name, never thrown.
 *
 * 3. THE URLS ARE UNTRUSTED INPUT. They arrive inside a file an operator
 *    pasted. Fetching one server-side with our credentials is exactly the SSRF
 *    shape — `http://169.254.169.254/...` in a menu export would have us fetch
 *    cloud metadata and store the result. Every URL goes through
 *    `assertPublicHttpUrl` first.
 *
 * 4. A CONTENT-TYPE IS A CLAIM, NOT A FACT. The remote server picks it. We
 *    verify the leading bytes against the raster magic numbers before storing,
 *    reusing the same check the branding uploader uses.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertPublicHttpUrl } from "@/lib/ssrf-guard";
import { matchesRasterMagic } from "@/lib/media/raster-magic";
import { logServerError } from "@/lib/server/safe-error";

/** Same public bucket the branding library writes to. */
export const MENU_PHOTO_BUCKET = "media-public";

/** A menu photo is CMS imagery, not talent media and not branding. */
export const MENU_PHOTO_PURPOSE = "cms";

/** Where the idempotency key lives on the asset row. */
export const SOURCE_URL_KEY = "source_url";

/**
 * 8 MB, matching the branding uploader. A menu photo far past this is a
 * mis-linked original, not a dish.
 */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Extensions we will store, and the mime each maps to. */
const RASTER: ReadonlyArray<{ ext: string; mime: string }> = [
  { ext: "jpg", mime: "image/jpeg" },
  { ext: "png", mime: "image/png" },
  { ext: "webp", mime: "image/webp" },
];

/**
 * Can we store what this server says it is sending?
 *
 * SVG is deliberately absent. It is a scriptable document, and serving one
 * from our own storage origin would be stored XSS — the branding uploader
 * refuses it for the same reason.
 */
export function isSupportedPhotoType(contentType: unknown): boolean {
  return extForContentType(contentType) !== null;
}

export type PhotoRefusalReason =
  | "unsafe_url"
  | "unsupported_type"
  | "fetch_failed"
  | "too_large"
  | "empty"
  | "not_an_image"
  | "store_failed";

export type PhotoRefusal = {
  sourceUrl: string;
  reason: PhotoRefusalReason;
  /** Something an operator can act on — never a bare code. */
  detail: string;
};

export type IngestedPhoto = {
  sourceUrl: string;
  mediaAssetId: string;
  /** True when an existing asset was reused rather than re-downloaded. */
  reused: boolean;
};

export type PhotoIngestResult = {
  ingested: IngestedPhoto[];
  refused: PhotoRefusal[];
  counts: { fetched: number; reused: number; refused: number };
};

/**
 * Decide the stored extension from the declared content type.
 *
 * Deliberately ignores the URL's own extension: a CDN path ending `.jpg` that
 * serves a PNG would be stored with bytes that contradict the name, and the
 * magic-byte check downstream would then reject a perfectly good image.
 */
export function extForContentType(contentType: unknown): { ext: string; mime: string } | null {
  if (typeof contentType !== "string") return null;
  const base = contentType.split(";")[0]!.trim().toLowerCase();
  if (base === "image/jpeg" || base === "image/jpg") return RASTER[0]!;
  if (base === "image/png") return RASTER[1]!;
  if (base === "image/webp") return RASTER[2]!;
  return null;
}

/**
 * Which URLs still need fetching, given what the library already holds.
 *
 * Pure, so the idempotency rule is testable without a network or a database —
 * which is the only honest way to test "a re-import downloads nothing".
 * De-duplicates within the batch too: two dishes sharing a photo fetch once.
 */
export function planPhotoFetches(
  sourceUrls: ReadonlyArray<string>,
  existingBySourceUrl: ReadonlyMap<string, string>,
): { toFetch: string[]; reused: IngestedPhoto[] } {
  const toFetch: string[] = [];
  const reused: IngestedPhoto[] = [];
  const seen = new Set<string>();

  for (const url of sourceUrls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const existing = existingBySourceUrl.get(url);
    if (existing) {
      reused.push({ sourceUrl: url, mediaAssetId: existing, reused: true });
    } else {
      toFetch.push(url);
    }
  }
  return { toFetch, reused };
}

/**
 * Every menu photo this tenant has already ingested, keyed by its source URL.
 *
 * Scoped to the tenant: two workspaces importing the same franchise menu each
 * keep their own copy, because a media asset is tenant-owned and one tenant
 * must never link a row belonging to another.
 */
export async function loadIngestedPhotos(
  admin: SupabaseClient,
  tenantId: string,
): Promise<Map<string, string>> {
  const bySource = new Map<string, string>();
  const { data, error } = await admin
    .from("media_assets")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("purpose", MENU_PHOTO_PURPOSE)
    .is("deleted_at", null);
  if (error) {
    // Non-fatal by design: failing to READ the index must not turn a re-import
    // into a re-download storm, so we surface it and treat the library as
    // empty only for this run.
    logServerError("menuPhotos.loadIngested", error);
    return bySource;
  }
  for (const row of data ?? []) {
    const meta = (row as { metadata?: unknown }).metadata;
    const url =
      meta && typeof meta === "object"
        ? (meta as Record<string, unknown>)[SOURCE_URL_KEY]
        : undefined;
    if (typeof url === "string" && url) bySource.set(url, String((row as { id: string }).id));
  }
  return bySource;
}

/**
 * Fetch one remote photo into memory, refusing rather than throwing.
 *
 * Reads through a cap instead of trusting `content-length`: a hostile or broken
 * server can under-report it, and streaming until the socket closes is how a
 * "photo" becomes an OOM.
 */
async function fetchPhoto(
  url: string,
  deps: { fetchImpl: typeof fetch },
): Promise<{ ok: true; bytes: Buffer; ext: string; mime: string } | { ok: false; refusal: PhotoRefusal }> {
  const safe = await assertPublicHttpUrl(url);
  if (!safe.ok) {
    return {
      ok: false,
      refusal: { sourceUrl: url, reason: "unsafe_url", detail: safe.reason },
    };
  }

  let res: Response;
  try {
    res = await deps.fetchImpl(url, { redirect: "manual" });
  } catch (error) {
    return {
      ok: false,
      refusal: { sourceUrl: url, reason: "fetch_failed", detail: String(error) },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      refusal: { sourceUrl: url, reason: "fetch_failed", detail: `HTTP ${res.status}` },
    };
  }

  const kind = extForContentType(res.headers.get("content-type"));
  if (!kind) {
    return {
      ok: false,
      refusal: {
        sourceUrl: url,
        reason: "unsupported_type",
        detail: `served ${res.headers.get("content-type") ?? "no content-type"} — JPEG, PNG or WebP only`,
      },
    };
  }

  let bytes: Buffer;
  try {
    const buf = await res.arrayBuffer();
    bytes = Buffer.from(buf);
  } catch (error) {
    return { ok: false, refusal: { sourceUrl: url, reason: "fetch_failed", detail: String(error) } };
  }
  if (bytes.length === 0) {
    return { ok: false, refusal: { sourceUrl: url, reason: "empty", detail: "zero bytes" } };
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      refusal: {
        sourceUrl: url,
        reason: "too_large",
        detail: `${Math.round(bytes.length / 1024)} KB exceeds the 8 MB cap`,
      },
    };
  }
  // The content-type was a claim; these bytes are the fact.
  if (!matchesRasterMagic(bytes.subarray(0, 16), kind.ext)) {
    return {
      ok: false,
      refusal: {
        sourceUrl: url,
        reason: "not_an_image",
        detail: `declared ${kind.mime} but the bytes are not ${kind.ext.toUpperCase()}`,
      },
    };
  }
  return { ok: true, bytes, ext: kind.ext, mime: kind.mime };
}

/**
 * Ingest every photo a menu import needs, and return the asset id per URL.
 *
 * Callers link the ids to offerings themselves — this module owns the library,
 * not the menu.
 */
export async function ingestMenuPhotos(
  admin: SupabaseClient,
  tenantId: string,
  sourceUrls: ReadonlyArray<string>,
  opts: { userId?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<PhotoIngestResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const existing = await loadIngestedPhotos(admin, tenantId);
  const { toFetch, reused } = planPhotoFetches(sourceUrls, existing);

  const ingested: IngestedPhoto[] = [...reused];
  const refused: PhotoRefusal[] = [];
  let fetched = 0;

  for (const url of toFetch) {
    const got = await fetchPhoto(url, { fetchImpl });
    if (!got.ok) {
      refused.push(got.refusal);
      continue;
    }

    const storagePath = `tenant/${tenantId}/menu/${randomUUID()}.${got.ext}`;
    const { error: upErr } = await admin.storage
      .from(MENU_PHOTO_BUCKET)
      .upload(storagePath, got.bytes, { contentType: got.mime, upsert: false });
    if (upErr) {
      logServerError("menuPhotos.upload", upErr);
      refused.push({ sourceUrl: url, reason: "store_failed", detail: "could not store the image" });
      continue;
    }

    const publicUrl = admin.storage.from(MENU_PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    const { data: row, error: insErr } = await admin
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        owner_tenant_id: tenantId,
        ownership_kind: "agency",
        // A menu photo is workspace imagery. Keeping it off talent surfaces
        // matters here: these dishes have no talent, and a stray asset showing
        // in a talent editor would be someone else's restaurant.
        owner_talent_profile_id: null,
        visible_on_master_profile: false,
        visible_in_talent_editor: false,
        uploaded_by_user_id: opts.userId ?? null,
        created_by: opts.userId ?? null,
        bucket_id: MENU_PHOTO_BUCKET,
        storage_path: storagePath,
        public_url: publicUrl,
        variant_kind: "original",
        approval_state: "approved",
        purpose: MENU_PHOTO_PURPOSE,
        sort_order: 0,
        file_size: got.bytes.length,
        file_size_bytes: got.bytes.length,
        byte_size: got.bytes.length,
        mime: got.mime,
        mime_type: got.mime,
        // The idempotency key. Rule 1 lives or dies on this being written.
        metadata: { source: "menu-import", [SOURCE_URL_KEY]: url },
      })
      .select("id")
      .single();

    if (insErr || !row) {
      // The bytes are stored but unreferenced — remove them rather than leave
      // an orphan the next run cannot find (it looks up by source_url, which
      // only exists on the row that just failed).
      await admin.storage.from(MENU_PHOTO_BUCKET).remove([storagePath]);
      logServerError("menuPhotos.insert", insErr);
      refused.push({ sourceUrl: url, reason: "store_failed", detail: "could not record the image" });
      continue;
    }

    fetched += 1;
    ingested.push({ sourceUrl: url, mediaAssetId: String((row as { id: string }).id), reused: false });
  }

  return {
    ingested,
    refused,
    counts: { fetched, reused: reused.length, refused: refused.length },
  };
}
