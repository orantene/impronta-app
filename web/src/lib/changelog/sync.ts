/**
 * Notion Releases → public.changelog_entries sync (TUL-1390).
 *
 * Copies every Releases entry whose Status is Published or Paused into
 * `changelog_entries`, with its body rendered to safe HTML (see
 * notion-render.ts) and every image re-hosted in the public `changelog`
 * bucket, because Notion file URLs expire after about an hour. Rows whose
 * Notion entry is no longer Published/Paused are deleted with their images.
 *
 * Notion is read-only here; nothing is written back. Unchanged pages (same
 * Notion last_edited_time) are skipped, so the 15-minute cron is cheap.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { readGuardedImage } from "@/lib/media/guarded-upload.server";
import { LIBRARY_RASTER_MIMES, readResponseCapped } from "@/lib/media/upload-guards";
import { safeFetch } from "@/lib/security/safe-fetch";

import { checkChangelogImageUrl } from "./image-url";
import {
  blocksToHtml,
  coverImageSource,
  imageBlockSource,
  imageStoragePath,
  mapReleasePage,
  splitBodyByLanguage,
  type NotionBlock,
  type NotionReleasePage,
} from "./notion-render";

export const CHANGELOG_TABLE = "changelog_entries";
export const CHANGELOG_BUCKET = "changelog";
/** Default Notion Releases database (override with NOTION_RELEASES_DATABASE_ID). */
export const DEFAULT_RELEASES_DATABASE_ID = "09c12dee16a444b9a8ec2298c8272deb";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Stop starting new pages after this, so the 60 s function never times out mid-write. */
const TIME_BUDGET_MS = 45_000;

export type ChangelogSyncDeps = {
  admin: SupabaseClient;
  apiKey: string;
  databaseId: string;
  fetchImpl?: typeof fetch;
  /** Re-render every page even if Notion says it is unchanged. */
  force?: boolean;
  now?: () => number;
};

export type ChangelogSyncResult = {
  synced: number;
  unchanged: number;
  removed: number;
  deferred: number;
  errors: string[];
};

async function notionGet<T>(deps: ChangelogSyncDeps, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchImpl(`${NOTION_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, Math.min(5, Number.isFinite(wait) ? wait : 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${method} ${path.split("?")[0]} failed (${res.status})`);
    return (await res.json()) as T;
  }
  throw new Error(`Notion ${method} ${path.split("?")[0]} kept failing`);
}

type NotionList<T> = { results: T[]; has_more: boolean; next_cursor: string | null };

async function listReleasePages(deps: ChangelogSyncDeps): Promise<NotionReleasePage[]> {
  const out: NotionReleasePage[] = [];
  let cursor: string | null = null;
  do {
    const page: NotionList<NotionReleasePage> = await notionGet(deps, "POST", `/databases/${deps.databaseId}/query`, {
      filter: {
        or: [
          { property: "Status", status: { equals: "Published" } },
          { property: "Status", status: { equals: "Paused" } },
        ],
      },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

async function listBlocks(deps: ChangelogSyncDeps, pageId: string): Promise<NotionBlock[]> {
  const out: NotionBlock[] = [];
  let cursor: string | null = null;
  do {
    const qs: string = `page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page: NotionList<NotionBlock> = await notionGet(deps, "GET", `/blocks/${pageId}/children?${qs}`);
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

/**
 * Production fetches go through `safeFetch` (vetted + pinned address, every redirect re-checked,
 * body capped). `deps.fetchImpl` is the test seam only; a caller that injects it owns the policy.
 */
async function fetchImageBytes(deps: ChangelogSyncDeps, url: string): Promise<Uint8Array | null> {
  if (deps.fetchImpl) {
    const res = await deps.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const read = await readResponseCapped(res, MAX_IMAGE_BYTES);
    return read.ok ? read.bytes : null;
  }
  const res = await safeFetch(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
  return res.ok && res.status >= 200 && res.status < 300 ? res.body : null;
}

/**
 * Download an image and store it in the changelog bucket. Returns the public URL,
 * or null when the image is skipped (unreachable, too big, or not a real raster
 * image). The bytes go through the H1 upload guards, not the Content-Type header:
 * streaming size cap, magic-byte type (png/jpeg/webp/gif only, so no SVG or HTML),
 * 100 MP pixel cap, and EXIF/GPS stripped.
 */
async function copyImage(deps: ChangelogSyncDeps, pageId: string, key: string, src: string): Promise<string | null> {
  // TUL-1584: https only and never a private / link-local / loopback host, before any request.
  const checked = checkChangelogImageUrl(src);
  if (!checked.ok) return null;
  const bytes = await fetchImageBytes(deps, checked.url);
  if (!bytes) return null;
  const guarded = await readGuardedImage(new Blob([new Uint8Array(bytes)]), {
    maxBytes: MAX_IMAGE_BYTES,
    allowed: LIBRARY_RASTER_MIMES,
  });
  if (!guarded.ok) return null;
  const path = imageStoragePath(pageId, key, guarded.ext);
  const bucket = deps.admin.storage.from(CHANGELOG_BUCKET);
  const { error } = await bucket.upload(path, guarded.bytes, { upsert: true, contentType: guarded.mime });
  if (error) throw new Error(`image upload failed for ${path}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}

async function removeImages(deps: ChangelogSyncDeps, pageId: string): Promise<void> {
  const bucket = deps.admin.storage.from(CHANGELOG_BUCKET);
  const folder = pageId.replace(/[^a-zA-Z0-9-]/g, "");
  const { data } = await bucket.list(folder, { limit: 100 });
  const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
  if (paths.length > 0) await bucket.remove(paths);
}

async function syncPage(deps: ChangelogSyncDeps, page: NotionReleasePage): Promise<void> {
  const fields = mapReleasePage(page);
  if (!fields) return;

  const blocks = await listBlocks(deps, page.id);
  const imageUrls = new Map<string, string>();
  for (const block of blocks) {
    const src = imageBlockSource(block);
    if (!src) continue;
    const url = await copyImage(deps, page.id, block.id, src);
    if (url) imageUrls.set(block.id, url);
  }
  const coverSrc = coverImageSource(page);
  const coverUrl = coverSrc ? await copyImage(deps, page.id, "cover", coverSrc) : null;

  const { en, es } = splitBodyByLanguage(blocks);
  // No onConflict: `notion_page_id` is the table's primary key, which is what an
  // upsert conflicts on by default (and the audit never flags a primary-key target).
  const { error } = await deps.admin.from(CHANGELOG_TABLE).upsert(
    {
      ...fields,
      body_en_html: blocksToHtml(en, imageUrls),
      body_es_html: blocksToHtml(es, imageUrls),
      cover_image_url: coverUrl,
      synced_at: new Date((deps.now ?? Date.now)()).toISOString(),
    },
  );
  if (error) throw new Error(`upsert failed: ${error.message}`);
}

export async function syncChangelog(deps: ChangelogSyncDeps): Promise<ChangelogSyncResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const result: ChangelogSyncResult = { synced: 0, unchanged: 0, removed: 0, deferred: 0, errors: [] };

  const pages = await listReleasePages(deps);
  const { data: existingRows, error: readError } = await deps.admin
    .from(CHANGELOG_TABLE)
    .select("notion_page_id, notion_last_edited_at");
  if (readError) throw new Error(`read ${CHANGELOG_TABLE} failed: ${readError.message}`);
  const existing = new Map<string, string | null>(
    (existingRows ?? []).map((r: { notion_page_id: string; notion_last_edited_at: string | null }) => [
      r.notion_page_id,
      r.notion_last_edited_at,
    ]),
  );

  const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
    Boolean(a && b && Date.parse(a) === Date.parse(b));

  for (const page of pages) {
    if (!deps.force && existing.has(page.id) && sameInstant(existing.get(page.id), page.last_edited_time)) {
      result.unchanged++;
      continue;
    }
    if (now() - started > TIME_BUDGET_MS) {
      result.deferred++;
      continue;
    }
    try {
      await syncPage(deps, page);
      result.synced++;
    } catch (err) {
      result.errors.push(`${page.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const live = new Set(pages.map((p) => p.id));
  for (const id of existing.keys()) {
    if (live.has(id)) continue;
    const { error } = await deps.admin.from(CHANGELOG_TABLE).delete().eq("notion_page_id", id);
    if (error) {
      result.errors.push(`${id}: delete failed`);
      continue;
    }
    await removeImages(deps, id).catch(() => undefined);
    result.removed++;
  }

  return result;
}
