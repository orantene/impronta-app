"use server";

/**
 * taxonomy-actions.ts (D5) — super_admin-gated taxonomy management for the
 * builder_templates table.
 *
 * Provides a first-class tag & category taxonomy manager:
 *   - listTemplateTaxonomy()           — distinct tags + categories with counts
 *   - renameTemplateTag(from, to)      — update every template carrying `from`
 *   - renameTemplateCategory(from, to) — update every template in category `from`
 *   - mergeTemplateTags(from[], into)  — re-tag every template in any `from` tag
 *   - deleteTemplateTag(tag)           — strip tag from every template carrying it
 *
 * All mutations route through the EXISTING `updateTemplateDraft` so the auth
 * gate, patch normalization, and revalidation are already handled correctly per
 * affected row. No new DB calls on the write path; reads use `listAllTemplates`.
 *
 * GATE: every exported action calls requireSuperAdmin() before any I/O.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { listAllTemplates } from "./registry-admin-actions";
import { updateTemplateDraft } from "./registry-actions";
import {
  aggregateTags,
  aggregateCategories,
  applyTagRename,
  applyTagMerge,
  applyTagDelete,
} from "./taxonomy-shape";

// Pure taxonomy types + helpers live in `taxonomy-shape` (this file carries the
// `"use server"` directive, under which every export must be an async function —
// AND must not re-export types: Next's server-actions codegen emits a runtime
// reference for a re-exported binding, throwing `X is not defined`. Types are
// imported here for local use only; consumers import them from `taxonomy-shape`).
import type { TemplateTaxonomy } from "./taxonomy-shape";

// ── Result type ───────────────────────────────────────────────────────────────

export type TaxonomyActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function ok<T>(data: T): TaxonomyActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): TaxonomyActionResult<never> {
  return { ok: false, error };
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

async function requireSuperAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true };
}

// ── listTemplateTaxonomy ──────────────────────────────────────────────────────

/**
 * Return distinct tags and categories across ALL templates (any status) with
 * per-value counts. Uses `listAllTemplates` so it includes drafts, in-review,
 * and archived — giving a complete picture for taxonomy curation.
 */
export async function listTemplateTaxonomy(): Promise<
  TaxonomyActionResult<TemplateTaxonomy>
> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const result = await listAllTemplates();
    if (!result.ok) return fail(result.error);

    return ok({
      tags: aggregateTags(result.data),
      categories: aggregateCategories(result.data),
    });
  } catch (err) {
    logServerError("listTemplateTaxonomy", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── renameTemplateTag ─────────────────────────────────────────────────────────

/**
 * Rename a tag across every template that carries it.
 * - Validates `from` and `to` are non-empty after trimming.
 * - Skips rows that don't carry `from`.
 * - If `to` already exists on a row the tags array is deduped (no double-tag).
 * - Returns the count of templates updated.
 */
export async function renameTemplateTag(
  from: string,
  to: string,
): Promise<TaxonomyActionResult<{ updatedCount: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const fromTag = from.trim();
  const toTag = to.trim();
  if (!fromTag) return fail("Source tag must not be empty.");
  if (!toTag) return fail("Target tag must not be empty.");
  if (fromTag === toTag) return ok({ updatedCount: 0 });

  try {
    const listResult = await listAllTemplates();
    if (!listResult.ok) return fail(listResult.error);

    const affected = listResult.data.filter((r) =>
      (r.tags ?? []).includes(fromTag),
    );

    let updatedCount = 0;
    for (const row of affected) {
      const nextTags = applyTagRename(row.tags ?? [], fromTag, toTag);
      if (nextTags === null) continue;
      const result = await updateTemplateDraft({ id: row.id, tags: nextTags });
      if (result.ok) updatedCount++;
    }

    return ok({ updatedCount });
  } catch (err) {
    logServerError("renameTemplateTag", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── renameTemplateCategory ────────────────────────────────────────────────────

/**
 * Rename a category across every template that belongs to it.
 * Returns the count of templates updated.
 */
export async function renameTemplateCategory(
  from: string,
  to: string,
): Promise<TaxonomyActionResult<{ updatedCount: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const fromCat = from.trim();
  const toCat = to.trim();
  if (!fromCat) return fail("Source category must not be empty.");
  if (!toCat) return fail("Target category must not be empty.");
  if (fromCat === toCat) return ok({ updatedCount: 0 });

  try {
    const listResult = await listAllTemplates();
    if (!listResult.ok) return fail(listResult.error);

    const affected = listResult.data.filter(
      (r) => (r.category ?? "").trim() === fromCat,
    );

    let updatedCount = 0;
    for (const row of affected) {
      const result = await updateTemplateDraft({
        id: row.id,
        category: toCat,
      });
      if (result.ok) updatedCount++;
    }

    return ok({ updatedCount });
  } catch (err) {
    logServerError("renameTemplateCategory", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── mergeTemplateTags ─────────────────────────────────────────────────────────

/**
 * Merge one or more source tags into a single target tag across every template.
 * Any template carrying at least one `from` tag will have ALL `from` tags
 * replaced with `into`; existing tags not in `from` are preserved.
 *
 * Useful for consolidating "photography", "photo", "Photography" into one value.
 * Returns the count of templates updated.
 */
export async function mergeTemplateTags(
  from: string[],
  into: string,
): Promise<TaxonomyActionResult<{ updatedCount: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const intoTag = into.trim();
  const fromTags = [...new Set(from.map((t) => t.trim()).filter(Boolean))];

  if (fromTags.length === 0)
    return fail("At least one source tag is required.");
  if (!intoTag) return fail("Target tag must not be empty.");

  try {
    const listResult = await listAllTemplates();
    if (!listResult.ok) return fail(listResult.error);

    const fromSet = new Set(fromTags);
    const affected = listResult.data.filter((r) =>
      (r.tags ?? []).some((t) => fromSet.has(t)),
    );

    let updatedCount = 0;
    for (const row of affected) {
      const nextTags = applyTagMerge(row.tags ?? [], fromTags, intoTag);
      if (nextTags === null) continue;
      const result = await updateTemplateDraft({ id: row.id, tags: nextTags });
      if (result.ok) updatedCount++;
    }

    return ok({ updatedCount });
  } catch (err) {
    logServerError("mergeTemplateTags", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── deleteTemplateTag ─────────────────────────────────────────────────────────

/**
 * Remove a tag from every template that carries it ("delete orphan").
 * Returns the count of templates updated.
 */
export async function deleteTemplateTag(
  tag: string,
): Promise<TaxonomyActionResult<{ updatedCount: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const targetTag = tag.trim();
  if (!targetTag) return fail("Tag must not be empty.");

  try {
    const listResult = await listAllTemplates();
    if (!listResult.ok) return fail(listResult.error);

    const affected = listResult.data.filter((r) =>
      (r.tags ?? []).includes(targetTag),
    );

    let updatedCount = 0;
    for (const row of affected) {
      const nextTags = applyTagDelete(row.tags ?? [], targetTag);
      if (nextTags === null) continue;
      const result = await updateTemplateDraft({ id: row.id, tags: nextTags });
      if (result.ok) updatedCount++;
    }

    return ok({ updatedCount });
  } catch (err) {
    logServerError("deleteTemplateTag", err);
    return fail(CLIENT_ERROR.generic);
  }
}
