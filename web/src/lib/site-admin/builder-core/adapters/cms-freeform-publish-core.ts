/**
 * Freeform cms-page publish + revision checkpoint, as plain (non-action)
 * functions taking an explicit Supabase client.
 *
 * WHY IT IS SPLIT OUT: `cms-page-actions.ts` is a `"use server"` file, so every
 * export there must be an async Server Action bound to a request session. The
 * scheduled-publish cron has no session — it runs on a `CRON_SECRET` bearer
 * with the service-role client — and it must publish freeform pages through
 * EXACTLY the same write + revision-checkpoint sequence an operator gets, not
 * a re-implementation. So the body lives here and both callers share it:
 *
 *   - `publishCmsFreeformPage` (server action)  → session client, after the
 *     `agency.site_admin.pages.publish` capability gate.
 *   - `/api/cron/publish-scheduled`             → service-role client, with the
 *     capability gate bypassed (the schedule was authored by a human who had
 *     the capability; the audit trail attributes the publish to them).
 *
 * The capability gate deliberately stays in the ACTION, not here — a caller
 * holding a service-role client has already proven itself by other means, and
 * burying an auth check inside a shared helper makes it easy to forget which
 * callers it actually covers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import { normalizeUnknownBuilderTreeLayout } from "@/lib/site-admin/builder-node/normalize-tree-layout";

import {
  buildFreeformRevisionSnapshot,
  nextFreeformRevisionVersion,
} from "./freeform-revision-snapshot";

/**
 * REV-1 — resolve the next `cms_page_revisions.version` for a freeform page: max
 * existing version + 1 (defaults to 1 for the first revision). Best-effort — a
 * read failure falls back to 1, which never blocks a save/publish (the revision
 * insert is itself best-effort).
 */
export async function nextCmsRevisionVersion(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
): Promise<number> {
  const { data } = await supabase
    .from("cms_page_revisions")
    .select("version")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  return nextFreeformRevisionVersion(data?.version);
}

/**
 * REV-1 — write a `cms_page_revisions` row capturing a freeform page's `blocks`
 * tree. Best-effort: a failure is swallowed (the page is already saved/published
 * once the row commits), mirroring `writeShellRevision` for the agency shell.
 * The snapshot carries the freeform tree under the shared `builderTree` key so
 * the existing revisions-drawer / diff / `parseBuilderTreeFromSnapshot` read it,
 * and so the public `/share/<token>` viewer can render it.
 */
export async function writeCmsFreeformRevision(input: {
  supabase: SupabaseClient;
  tenantId: string;
  pageId: string;
  title: string;
  blocks: unknown;
  kind: "draft" | "published" | "rollback";
  actorProfileId: string | null;
}): Promise<void> {
  try {
    const version = await nextCmsRevisionVersion(
      input.supabase,
      input.tenantId,
      input.pageId,
    );
    await input.supabase.from("cms_page_revisions").insert({
      tenant_id: input.tenantId,
      page_id: input.pageId,
      kind: input.kind,
      version,
      snapshot: buildFreeformRevisionSnapshot({
        title: input.title,
        blocks: input.blocks,
      }),
      created_by: input.actorProfileId,
    });
  } catch {
    // Non-fatal: the page is already persisted; a missing revision row only
    // means this checkpoint isn't restorable, never that the save/publish failed.
  }
}

export type FreeformSaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; error: string };

/**
 * Persist a freeform page's tree (+ optional title / STYLE-1 registries) to
 * `cms_pages.blocks` and checkpoint it as a `kind='draft'` revision. This is
 * the body of the editor's `saveCmsFreeformPage` action, split out for the
 * same reason as the publish core above: a session-less caller (a maintenance
 * script run under the service role) must save through EXACTLY the write the
 * operator's autosave runs — lock re-assert (C1), draft-save normalization,
 * the style-column fallback and the REV-1 checkpoint — never a second
 * implementation or a raw UPDATE. The capability gate stays in the action.
 */
export async function saveCmsFreeformPageWithClient(input: {
  supabase: SupabaseClient;
  tenantId: string;
  pageId: string;
  patch: {
    blocks: unknown;
    updated_at: string;
    title?: string;
    style_classes?: unknown;
    style_presets?: unknown;
  };
  actorProfileId: string | null;
}): Promise<FreeformSaveResult> {
  const { supabase, tenantId, pageId } = input;

  // C1 — server-trusted lock enforcement on the full-tree save. Load the current
  // blocks and re-assert every admin lock so a crafted client can't persist an
  // edit to a locked prop (the inspector strip alone is bypassable).
  const { data: current, error: currentErr } = await supabase
    .from("cms_pages")
    .select("blocks")
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .eq("is_freeform", true)
    .maybeSingle()
    .returns<{ blocks: unknown }>();
  if (currentErr) return { ok: false, error: currentErr.message };
  // Draft-save normalization gate (content-preserving; strict validate stays
  // at publish). Runs at the same C1 chokepoint as the lock re-assert.
  const enforcedBlocks = normalizeUnknownBuilderTreeLayout(
    enforceLockedPropsOnTree(input.patch.blocks ?? [], current?.blocks),
  );

  const patch: Record<string, unknown> = {
    blocks: enforcedBlocks,
    updated_at: input.patch.updated_at,
  };
  if (typeof input.patch.title === "string" && input.patch.title.length > 0) {
    patch.title = input.patch.title;
  }
  // STYLE-1 — only set the style columns when the caller actually touched them
  // (`undefined` = leave the stored value alone). `null` clears the column.
  const stylePatch: Record<string, unknown> = {};
  if (input.patch.style_classes !== undefined) {
    stylePatch.style_classes = input.patch.style_classes;
  }
  if (input.patch.style_presets !== undefined) {
    stylePatch.style_presets = input.patch.style_presets;
  }

  const runUpdate = (payload: Record<string, unknown>) =>
    supabase
      .from("cms_pages")
      .update(payload)
      .eq("id", pageId)
      .eq("tenant_id", tenantId)
      .eq("is_freeform", true)
      .select("updated_at")
      .maybeSingle()
      .returns<{ updated_at: string }>();

  // REV-1 — checkpoint the saved freeform tree as a restorable draft revision.
  // Best-effort, never blocks the save result.
  const checkpoint = (updatedAt: string) =>
    writeCmsFreeformRevision({
      supabase,
      tenantId,
      pageId,
      title: (typeof input.patch.title === "string" && input.patch.title) || "Page",
      blocks: enforcedBlocks,
      kind: "draft",
      actorProfileId: input.actorProfileId,
    }).then(() => updatedAt);

  const { data, error } = await runUpdate({ ...patch, ...stylePatch });
  if (!error && data) return { ok: true, updatedAt: await checkpoint(data.updated_at) };

  // STYLE-1 graceful fallback — if the style columns don't exist yet (migration
  // unapplied) the update errors. Retry WITHOUT them so the tree still saves; the
  // registry stays in the editor's localStorage seed until the migration lands.
  if (Object.keys(stylePatch).length > 0) {
    const retry = await runUpdate(patch);
    if (!retry.error && retry.data) {
      return { ok: true, updatedAt: await checkpoint(retry.data.updated_at) };
    }
    return { ok: false, error: retry.error?.message ?? "Could not save the page." };
  }
  return { ok: false, error: error?.message ?? "Could not save the page." };
}

export type FreeformPublishResult =
  | { ok: true; publishedAt: string; updatedAt: string }
  | { ok: false; error: string };

/**
 * Flip a freeform cms page to `status='published'` and checkpoint the published
 * tree as a `kind='published'` revision. Caller supplies the client and has
 * already decided the caller is allowed to publish.
 */
export async function publishCmsFreeformPageWithClient(input: {
  supabase: SupabaseClient;
  tenantId: string;
  pageId: string;
  actorProfileId: string | null;
}): Promise<FreeformPublishResult> {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("cms_pages")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", input.pageId)
    .eq("tenant_id", input.tenantId)
    .eq("is_freeform", true)
    .select("title, blocks, published_at, updated_at")
    .maybeSingle()
    .returns<{
      title: string;
      blocks: unknown;
      published_at: string;
      updated_at: string;
    }>();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not publish the page." };
  }

  await writeCmsFreeformRevision({
    supabase: input.supabase,
    tenantId: input.tenantId,
    pageId: input.pageId,
    title: data.title ?? "Page",
    blocks: data.blocks,
    kind: "published",
    actorProfileId: input.actorProfileId,
  });

  return {
    ok: true,
    publishedAt: data.published_at ?? now,
    updatedAt: data.updated_at,
  };
}
