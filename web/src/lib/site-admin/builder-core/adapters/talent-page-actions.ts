"use server";

/**
 * Talent-page server actions (WS6 / Gap 3).
 *
 * The actual DB mutations for the talent_page surface, as individual
 * "use server" actions (the directive requires every export to be an async
 * function). The adapter binding (`talent-page-adapter.ts`) references these —
 * it is NOT itself "use server", so it can also export the non-async factory +
 * types and be imported by the client editor. Mirrors the homepage adapter.
 *
 * All DB access uses the cookie-session Supabase client so `talent_pages` RLS
 * (talent owner + workspace staff) takes effect. NEVER writes `cms_page_sections`.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { mergeStyleClassesPreservingDesign } from "@/lib/site-admin/edit-mode/talent-design-store";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import { normalizeUnknownBuilderTreeLayout } from "@/lib/site-admin/builder-node/normalize-tree-layout";

import type {
  TalentPageAdapterActions,
  TalentPageRow,
} from "./talent-page-adapter-core";

// STYLE-1 — the dedicated style_classes/style_presets columns are selected on a
// graceful path: a pre-migration DB (columns absent) ERRORS the whole PostgREST
// query (data:null), so the BASE list omits them and the editor falls back to it.
// SEO-1 — the metadata/OG columns are in the BASE list, not the graceful-degrade
// suffix: the PUBLIC read path (`loadMaxSitePages`) already selects the identical
// set in a single non-degrading query, so they are guaranteed-present columns.
// Without them the Page settings drawer's SEO fields were a silent no-op here.
const TALENT_PAGE_BASE_COLS =
  "id, talent_profile_id, slug, title, status, blocks, theme, required_talent_tier, published_at, updated_at, " +
  "meta_description, og_title, og_description, og_image_url, canonical_url, noindex, json_ld";
const TALENT_PAGE_COLS = `${TALENT_PAGE_BASE_COLS}, style_classes, style_presets`;

/** SEO-1 — the metadata columns a talent-page save may write. Same convention as
 *  the STYLE-1 registries: `undefined` = leave the stored value alone (a
 *  tree-only autosave carries no metadata), `null` = clear the column.
 *  No `meta_title`: `talent_pages` has no such column (see the adapter core). */
const META_PATCH_KEYS = [
  "meta_description",
  "og_title",
  "og_description",
  "og_image_url",
  "canonical_url",
  "noindex",
  "json_ld",
] as const;

export async function loadTalentPageAction(
  input: Parameters<TalentPageAdapterActions["loadPage"]>[0],
): Promise<TalentPageRow | null> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return null;
    const selectRow = (cols: string) =>
      sb
        .from("talent_pages")
        .select(cols)
        .eq("talent_profile_id", input.talentProfileId)
        .eq("slug", input.slug)
        .single();
    const { data, error } = await selectRow(TALENT_PAGE_COLS);
    if (!error && data) return data as unknown as TalentPageRow;
    // STYLE-1 graceful fallback — style columns not yet migrated.
    const fallback = await selectRow(TALENT_PAGE_BASE_COLS);
    if (fallback.error || !fallback.data) return null;
    return fallback.data as unknown as TalentPageRow;
  } catch (err) {
    logServerError("talentPageAdapter/loadPage", err);
    return null;
  }
}

export async function ensureTalentPageAction(
  input: Parameters<TalentPageAdapterActions["ensurePage"]>[0],
): Promise<TalentPageRow | null> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return null;

    const selectExisting = (cols: string) =>
      sb
        .from("talent_pages")
        .select(cols)
        .eq("talent_profile_id", input.talentProfileId)
        .eq("slug", input.slug)
        .maybeSingle();

    // 1. Try to load the existing row (style columns first, base on fallback).
    let existing: unknown = null;
    {
      const ext = await selectExisting(TALENT_PAGE_COLS);
      if (!ext.error && ext.data) {
        existing = ext.data;
      } else {
        const base = await selectExisting(TALENT_PAGE_BASE_COLS);
        if (base.error) {
          logServerError("talentPageAdapter/ensurePage/load", base.error);
          return null;
        }
        existing = base.data;
      }
    }
    if (existing) return existing as unknown as TalentPageRow;

    // 2. No row — INSERT a draft. Re-select with graceful fallback.
    const insertReturning = async (cols: string) =>
      sb
        .from("talent_pages")
        .insert({
          talent_profile_id: input.talentProfileId,
          slug: input.slug,
          status: "draft",
          blocks: [],
          theme: {},
        })
        .select(cols)
        .single();

    let inserted = await insertReturning(TALENT_PAGE_COLS);
    if (inserted.error && inserted.error.code !== "23505") {
      // Could be the missing-style-column error; retry the insert returning base.
      inserted = await insertReturning(TALENT_PAGE_BASE_COLS);
    }

    if (inserted.error) {
      // 23505 = unique_violation — concurrent insert; re-select.
      if (inserted.error.code === "23505") {
        const raced = await selectExisting(TALENT_PAGE_COLS);
        if (!raced.error && raced.data) return raced.data as unknown as TalentPageRow;
        const racedBase = await selectExisting(TALENT_PAGE_BASE_COLS);
        if (racedBase.error) {
          logServerError("talentPageAdapter/ensurePage/race-reselect", racedBase.error);
          return null;
        }
        return (racedBase.data as unknown as TalentPageRow) ?? null;
      }
      logServerError("talentPageAdapter/ensurePage/insert", inserted.error);
      return null;
    }

    return inserted.data as unknown as TalentPageRow;
  } catch (err) {
    logServerError("talentPageAdapter/ensurePage", err);
    return null;
  }
}

export async function saveTalentPageAction(
  input: Parameters<TalentPageAdapterActions["savePage"]>[0],
): ReturnType<TalentPageAdapterActions["savePage"]> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { talentProfileId, pageId, patch } = input;

    // The content adapter's `patch.theme` is the page-scoped style-class
    // registry. `talent_pages.theme` ALSO carries the talent's THEME slice under
    // a reserved `__design` key (see talent-design-store). A naive
    // `theme: patch.theme` would WIPE that slice on every content save, so we
    // read the current theme and merge the new style classes on top while
    // PRESERVING `__design`. (This is the production binding, not the pure
    // adapter-core factory — its page-content contract is unchanged.)
    const { data: existing } = await sb
      .from("talent_pages")
      .select("theme, blocks")
      .eq("id", pageId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    const mergedTheme = mergeStyleClassesPreservingDesign(
      (existing as { theme: unknown } | null)?.theme,
      patch.theme,
    );

    // C1 — server-trusted lock enforcement on the full-tree save. The inspector
    // strips locked-prop edits, but a crafted client could still POST a tree
    // with a locked prop changed; re-assert every lock against the current row.
    // Draft-save normalization gate (content-preserving; strict validate stays
    // at publish). Runs at the same C1 chokepoint as the lock re-assert.
    const enforcedBlocks = normalizeUnknownBuilderTreeLayout(
      enforceLockedPropsOnTree(
        patch.blocks,
        (existing as { blocks: unknown } | null)?.blocks,
      ),
    );

    const updatePayload: Record<string, unknown> = {
      blocks: enforcedBlocks,
      theme: mergedTheme,
      updated_at: patch.updated_at,
    };
    if (patch.title !== undefined) updatePayload.title = patch.title;

    // SEO-1 — only set a metadata column when the caller actually supplied it.
    // WIPE HAZARD: a tree-only autosave/draft-flush carries no metadata; writing
    // these unconditionally would NULL every SEO field on every keystroke-driven
    // save — and this surface's columns are rendered on the LIVE public site.
    // `undefined` = untouched, `null` = clear.
    for (const key of META_PATCH_KEYS) {
      const value = patch[key];
      if (value !== undefined) updatePayload[key] = value;
    }

    // STYLE-1 — also persist the dedicated columns when the caller touched them.
    const stylePatch: Record<string, unknown> = {};
    if (patch.style_classes !== undefined) stylePatch.style_classes = patch.style_classes;
    if (patch.style_presets !== undefined) stylePatch.style_presets = patch.style_presets;

    const runUpdate = (payload: Record<string, unknown>) =>
      sb
        .from("talent_pages")
        .update(payload)
        .eq("id", pageId)
        .eq("talent_profile_id", talentProfileId)
        .select("updated_at")
        .single();

    let { data, error } = await runUpdate({ ...updatePayload, ...stylePatch });
    // STYLE-1 graceful fallback — style columns not yet migrated → retry without.
    if (error && Object.keys(stylePatch).length > 0) {
      ({ data, error } = await runUpdate(updatePayload));
    }

    if (error || !data)
      return { ok: false as const, error: error?.message ?? "Talent page save failed." };
    return { ok: true as const, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("talentPageAdapter/savePage", err);
    return { ok: false as const, error: "Unexpected error saving talent page." };
  }
}

export async function publishTalentPageAction(
  input: Parameters<TalentPageAdapterActions["publishPage"]>[0],
): ReturnType<TalentPageAdapterActions["publishPage"]> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { talentProfileId, pageId } = input;
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("talent_pages")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("id", pageId)
      .eq("talent_profile_id", talentProfileId)
      .select("published_at, updated_at")
      .single();

    if (error || !data)
      return { ok: false as const, error: error?.message ?? "Talent page publish failed." };
    return {
      ok: true as const,
      publishedAt: data.published_at as string,
      updatedAt: data.updated_at as string,
    };
  } catch (err) {
    logServerError("talentPageAdapter/publishPage", err);
    return { ok: false as const, error: "Unexpected error publishing talent page." };
  }
}

export async function restoreTalentPageRevisionAction(
  input: Parameters<NonNullable<TalentPageAdapterActions["restoreRevision"]>>[0],
): ReturnType<NonNullable<TalentPageAdapterActions["restoreRevision"]>> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { talentProfileId, pageId, revisionId } = input;
    const { data: rev, error: revErr } = await sb
      .from("talent_page_revisions")
      .select("blocks, theme")
      .eq("id", revisionId)
      .single();

    if (revErr || !rev)
      return { ok: false as const, error: revErr?.message ?? "Talent page revision not found." };

    // Restoring a revision restores PAGE CONTENT (blocks + style classes). The
    // talent's THEME slice (`__design`) is a separate concern carried on the live
    // row, so preserve it across a content restore rather than reverting it to
    // whatever the snapshot held (revisions predate the design slice).
    const { data: live } = await sb
      .from("talent_pages")
      .select("theme, blocks")
      .eq("id", pageId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    const mergedTheme = mergeStyleClassesPreservingDesign(
      (live as { theme: unknown } | null)?.theme,
      rev.theme,
    );

    // C1 — re-assert current locks onto the restored content so restoring an
    // old (pre-lock or tampered) revision can't drop an admin lock.
    const restoredBlocks = normalizeUnknownBuilderTreeLayout(
      enforceLockedPropsOnTree(
        rev.blocks,
        (live as { blocks: unknown } | null)?.blocks,
      ),
    );

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("talent_pages")
      .update({ blocks: restoredBlocks, theme: mergedTheme, updated_at: now, status: "draft" })
      .eq("id", pageId)
      .eq("talent_profile_id", talentProfileId)
      .select("updated_at")
      .single();

    if (error || !data)
      return { ok: false as const, error: error?.message ?? "Talent page restore failed." };
    return { ok: true as const, updatedAt: data.updated_at as string };
  } catch (err) {
    logServerError("talentPageAdapter/restoreRevision", err);
    return { ok: false as const, error: "Unexpected error restoring talent page revision." };
  }
}
