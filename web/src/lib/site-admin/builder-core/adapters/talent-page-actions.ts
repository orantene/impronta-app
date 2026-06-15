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

import type {
  TalentPageAdapterActions,
  TalentPageRow,
} from "./talent-page-adapter-core";

export async function loadTalentPageAction(
  input: Parameters<TalentPageAdapterActions["loadPage"]>[0],
): Promise<TalentPageRow | null> {
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from("talent_pages")
      .select(
        "id, talent_profile_id, slug, title, status, blocks, theme, required_talent_tier, published_at, updated_at",
      )
      .eq("talent_profile_id", input.talentProfileId)
      .eq("slug", input.slug)
      .single();
    if (error || !data) return null;
    return data as TalentPageRow;
  } catch (err) {
    logServerError("talentPageAdapter/loadPage", err);
    return null;
  }
}

export async function ensureTalentPageAction(
  input: Parameters<TalentPageAdapterActions["ensurePage"]>[0],
): Promise<TalentPageRow | null> {
  const SELECT_COLS =
    "id, talent_profile_id, slug, title, status, blocks, theme, required_talent_tier, published_at, updated_at";
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return null;

    // 1. Try to load the existing row.
    const { data: existing, error: loadErr } = await sb
      .from("talent_pages")
      .select(SELECT_COLS)
      .eq("talent_profile_id", input.talentProfileId)
      .eq("slug", input.slug)
      .maybeSingle();

    if (loadErr) {
      logServerError("talentPageAdapter/ensurePage/load", loadErr);
      return null;
    }
    if (existing) return existing as TalentPageRow;

    // 2. No row — INSERT a draft.
    const { data: inserted, error: insertErr } = await sb
      .from("talent_pages")
      .insert({
        talent_profile_id: input.talentProfileId,
        slug: input.slug,
        status: "draft",
        blocks: [],
        theme: {},
      })
      .select(SELECT_COLS)
      .single();

    if (insertErr) {
      // 23505 = unique_violation — concurrent insert; re-select.
      if (insertErr.code === "23505") {
        const { data: raced, error: raceErr } = await sb
          .from("talent_pages")
          .select(SELECT_COLS)
          .eq("talent_profile_id", input.talentProfileId)
          .eq("slug", input.slug)
          .maybeSingle();
        if (raceErr) {
          logServerError("talentPageAdapter/ensurePage/race-reselect", raceErr);
          return null;
        }
        return (raced as TalentPageRow) ?? null;
      }
      logServerError("talentPageAdapter/ensurePage/insert", insertErr);
      return null;
    }

    return inserted as TalentPageRow;
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
    const enforcedBlocks = enforceLockedPropsOnTree(
      patch.blocks,
      (existing as { blocks: unknown } | null)?.blocks,
    );

    const updatePayload: Record<string, unknown> = {
      blocks: enforcedBlocks,
      theme: mergedTheme,
      updated_at: patch.updated_at,
    };
    if (patch.title !== undefined) updatePayload.title = patch.title;

    const { data, error } = await sb
      .from("talent_pages")
      .update(updatePayload)
      .eq("id", pageId)
      .eq("talent_profile_id", talentProfileId)
      .select("updated_at")
      .single();

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
    const restoredBlocks = enforceLockedPropsOnTree(
      rev.blocks,
      (live as { blocks: unknown } | null)?.blocks,
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
