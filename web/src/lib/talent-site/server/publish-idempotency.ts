import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/** A publish this recent, of the same content, is a double submit. */
export const DUPLICATE_PUBLISH_WINDOW_MS = 120_000;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

/**
 * Pure: the idempotency key of one publish = a scope label + a hash of the
 * DRAFT content being published. Independent of `draft_rev` (which only the
 * draft-writer RPC bumps, so a writer that skips it would fool a rev key).
 */
export function publishContentHash(scope: string, content: unknown): string {
  const h = createHash("sha256").update(JSON.stringify(stable(content)) ?? "null").digest("hex").slice(0, 32);
  return `${scope}:${h}`;
}

/**
 * Pure: is a publish with `hash` a repeat of the last publish entry? Same
 * content hash within the window. The window keeps an old, unrelated publish
 * of identical content from swallowing a deliberate re-publish.
 */
export function isDuplicatePublish(
  last: { contentHash: string | null; at: string } | null,
  hash: string,
  now: number = Date.now(),
): boolean {
  if (!last || !last.contentHash || last.contentHash !== hash) return false;
  const at = Date.parse(last.at);
  return Number.isFinite(at) && now - at >= 0 && now - at <= DUPLICATE_PUBLISH_WINDOW_MS;
}

/** Key for publishing one talent page: its id + draft body. */
export async function pageScopeHash(
  admin: SupabaseClient,
  talentProfileId: string,
  pageId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("talent_pages")
    .select("blocks")
    .eq("talent_profile_id", talentProfileId)
    .eq("id", pageId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("publishIdempotency.page", error);
    return null;
  }
  return publishContentHash(`page:${pageId}`, (data as { blocks: unknown }).blocks);
}

/** Key for publishing the site shell: its draft tree + style registry. */
export async function shellScopeHash(admin: SupabaseClient, talentProfileId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("shell_tree, style_classes")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error || !data) {
    // style_classes may not be migrated: fall back to the tree alone.
    const retry = await admin.from("talent_sites").select("shell_tree").eq("talent_profile_id", talentProfileId).maybeSingle();
    if (retry.error || !retry.data) return null;
    return publishContentHash("shell", { tree: (retry.data as { shell_tree: unknown }).shell_tree });
  }
  const row = data as { shell_tree: unknown; style_classes: unknown };
  return publishContentHash("shell", { tree: row.shell_tree, classes: row.style_classes ?? null });
}

/**
 * F104 - server-side idempotency for the builder publish: when the latest
 * `publish` history entry carries the same content hash (and is recent),
 * return it so the caller skips the second publish and history entry.
 */
export async function findDuplicatePublish(
  admin: SupabaseClient,
  talentProfileId: string,
  hash: string | null,
): Promise<{ publishedAt: string; draftRev: number } | null> {
  if (!hash) return null;
  const { data: site, error: siteErr } = await admin
    .from("talent_sites")
    .select("id, draft_rev")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (siteErr || !site) return null;
  const s = site as { id: string; draft_rev: number | null };
  const { data, error } = await admin
    .from("talent_site_history")
    .select("report, last_at")
    .eq("site_id", s.id)
    .eq("kind", "publish")
    .order("last_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = ((data ?? []) as Array<{ report: { contentHash?: unknown } | null; last_at: string }>)[0];
  if (!row) return null;
  const last = {
    contentHash: typeof row.report?.contentHash === "string" ? row.report.contentHash : null,
    at: row.last_at,
  };
  return isDuplicatePublish(last, hash)
    ? { publishedAt: row.last_at, draftRev: typeof s.draft_rev === "number" ? s.draft_rev : 0 }
    : null;
}
