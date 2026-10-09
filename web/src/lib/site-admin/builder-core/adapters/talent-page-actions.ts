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

import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { mergeStyleClassesPreservingDesign } from "@/lib/site-admin/edit-mode/talent-design-store";
import { enforceLockedPropsOnTree } from "@/lib/site-admin/builder-node/prop-lock";
import { normalizeUnknownBuilderTreeLayout } from "@/lib/site-admin/builder-node/normalize-tree-layout";
import { assertFreeTalentSiteTreeMutation } from "@/lib/talent-site/free-site-tree-guard";
import { stripTalentSiteSeoPatch } from "@/lib/talent-site/free-site-seo";
import { loadTalentSiteSaveCapabilities } from "@/lib/talent-site/server/free-site-save-guard";
import { refuseTalentPremiumAppTreeMutation } from "@/lib/talent-site/server/premium-app-save-guard";
import { publishTalentPageBodies } from "@/lib/talent-site/server/publish-talent-page-bodies";
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CONFLICT_COPY, editSummary, pick, summaryFor } from "@/lib/talent-site/history/copy";
import { loadOwnedSiteRev, loadSiteRev } from "@/lib/talent-site/history/history.server";
import { recordSiteHistory, writeSiteDraft } from "@/lib/talent-site/history/writer";

import { delegateFirstPublish } from "@/lib/talent-site/server/first-publish-delegate";
import { publishSiteChromeWithPage } from "@/lib/talent-site/server/publish-site-chrome-with-page";
import { findDuplicatePublish, pageScopeHash } from "@/lib/talent-site/server/publish-idempotency";
import type {
  TalentPageAdapterActions,
  TalentPageRow,
} from "./talent-page-adapter-core";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

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
// `blocks_published` rides the graceful list too: the editor falls back to the
// live body when the draft is empty (resolveTalentPageEditorTree).
const TALENT_PAGE_COLS = `${TALENT_PAGE_BASE_COLS}, style_classes, style_presets, blocks_published`;

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

/** Theme releases Phase 2 — the editor's CAS version is the site's draft_rev. */
async function withDraftRev(row: TalentPageRow): Promise<TalentPageRow> {
  const admin = createServiceRoleClient();
  if (!admin) return row;
  const site = await loadSiteRev(admin, row.talent_profile_id);
  return site ? { ...row, draft_rev: site.draftRev } : row;
}

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
    if (!error && data) return withDraftRev(data as unknown as TalentPageRow);
    // STYLE-1 graceful fallback — style columns not yet migrated.
    const fallback = await selectRow(TALENT_PAGE_BASE_COLS);
    if (fallback.error || !fallback.data) return null;
    return withDraftRev(fallback.data as unknown as TalentPageRow);
  } catch (err) {
    logServerError("talentPageAdapter/loadPage", err);
    return null;
  }
}

export async function ensureTalentPageAction(
  input: Parameters<TalentPageAdapterActions["ensurePage"]>[0],
): Promise<TalentPageRow | null> {
  await requireNotImpersonating();
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
    if (existing) return withDraftRev(existing as unknown as TalentPageRow);

    // PHASE 1 — creating a page is Web Office (`personalSitePages`). This
    // action is a `"use server"` export, so it is callable directly with any
    // slug regardless of what the builder UI offers; RLS alone would happily
    // let a Free talent mint extra rows under their own profile. `null` = the
    // free-site rules do not apply (switch off, staff editor, not the owner),
    // in which case this is byte-identical to before.
    //
    // A talent with NO page row yet is exempt: that first row IS their home
    // page, not an extra one, and the free-site wizard depends on it.
    const siteCaps = await loadTalentSiteSaveCapabilities(input.talentProfileId);
    if (siteCaps && !siteCaps.personalSitePages) {
      const { count, error: countError } = await sb
        .from("talent_pages")
        .select("id", { count: "exact", head: true })
        .eq("talent_profile_id", input.talentProfileId);
      // Fail CLOSED on an unreadable count: we could not prove this is the
      // bootstrap page, so we do not create one.
      if (countError) {
        logServerError("talentPageAdapter/ensurePage/pageCount", countError);
        return null;
      }
      if ((count ?? 0) > 0) return null;
    }

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

    return withDraftRev(inserted.data as unknown as TalentPageRow);
  } catch (err) {
    logServerError("talentPageAdapter/ensurePage", err);
    return null;
  }
}

export async function saveTalentPageAction(
  input: Parameters<TalentPageAdapterActions["savePage"]>[0],
): ReturnType<TalentPageAdapterActions["savePage"]> {
  await requireNotImpersonating();
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
      .select("theme, blocks, title")
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

    // PHASE 1 — free personal website. `null` = the free-site rules do not
    // apply to this save (switch off, staff editor, or not the row's owner),
    // in which case everything below behaves exactly as it did before.
    const siteCaps = await loadTalentSiteSaveCapabilities(talentProfileId);
    if (siteCaps) {
      const structural = assertFreeTalentSiteTreeMutation({
        previousTree: (existing as { blocks: unknown } | null)?.blocks,
        nextTree: enforcedBlocks,
        canInsertSections: siteCaps.personalSiteSections,
      });
      if (!structural.ok) {
        return { ok: false as const, error: structural.message };
      }
    }

    // TUL-39 — premium apps: fail-closed on the talent-owner add/install path
    // (flag-independent). Staff saves skip; a talent cannot bypass.
    {
      const premiumErr = await refuseTalentPremiumAppTreeMutation({
        talentProfileId,
        previousTree: (existing as { blocks: unknown } | null)?.blocks,
        nextTree: enforcedBlocks,
        locale: await getRequestLocale(),
      });
      if (premiumErr) {
        return { ok: false as const, error: premiumErr };
      }
    }

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

    // PHASE 1 — SEO is Web Office. Without `personalSiteSeo` the SEO columns are
    // STRIPPED from the patch rather than failing the save: a free talent
    // editing text must never be told their save failed because of a field
    // they cannot see. Stored values are left untouched, so a restored plan
    // brings them straight back.
    const scopedPayload = stripTalentSiteSeoPatch(
      updatePayload,
      siteCaps ? siteCaps.personalSiteSeo : true,
    );

    // Theme releases Phase 2 — the OWNER's page on a site writes through the
    // atomic draft writer: CAS on draft_rev + the page body + a batched history
    // entry in one transaction. Ownership is checked explicitly (a published
    // page is publicly READABLE, so the RLS read above is not a write grant);
    // workspace staff keep the RLS-scoped write below.
    const admin = existing ? createServiceRoleClient() : null;
    const actor = admin ? await getCachedActorSession() : null;
    const site = admin ? await loadOwnedSiteRev(admin, talentProfileId, actor?.user?.id) : null;
    if (admin && site) {
      // The RPC stamps updated_at itself.
      const pagePatch: Record<string, unknown> = { ...scopedPayload, ...stylePatch };
      delete pagePatch.updated_at;
      const summary = editSummary(
        "page",
        typeof patch.title === "string" ? patch.title : (existing as { title?: string }).title,
      );
      const res = await writeSiteDraft(admin, {
        siteId: site.siteId,
        expectedDraftRev: input.expectedDraftRev ?? null,
        pages: [{ id: pageId, patch: pagePatch }],
        history: { kind: "edit", summaryEn: summary.en, summaryEs: summary.es },
      });
      if (res.ok) return { ok: true as const, updatedAt: res.updatedAt, draftRev: res.draftRev };
      if (res.code === "conflict") {
        return {
          ok: false as const,
          code: "VERSION_CONFLICT",
          error: pick(CONFLICT_COPY, await getRequestLocale()),
        };
      }
      return { ok: false as const, error: res.error };
    }

    let { data, error } = await runUpdate({ ...scopedPayload, ...stylePatch });
    // STYLE-1 graceful fallback — style columns not yet migrated → retry without.
    if (error && Object.keys(stylePatch).length > 0) {
      ({ data, error } = await runUpdate(scopedPayload));
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
  await requireNotImpersonating();
  try {
    const sb = await getCachedServerSupabase();
    if (!sb) return { ok: false as const, error: "Supabase client unavailable." };

    const { talentProfileId, pageId } = input;
    // F104: same draft rev as the last publish means nothing changed since; a
    // double submit returns the existing publish instead of publishing again.
    const dupAdmin = createServiceRoleClient();
    const pageHash = dupAdmin ? await pageScopeHash(dupAdmin, talentProfileId, pageId) : null;
    const dup = dupAdmin ? await findDuplicatePublish(dupAdmin, talentProfileId, pageHash) : null;
    if (dup) return { ok: true as const, publishedAt: dup.publishedAt, updatedAt: dup.publishedAt, draftRev: dup.draftRev };
    // F96: first publish of the site runs the canonical site publish.
    const first = await delegateFirstPublish(sb, talentProfileId, { contentHash: pageHash });
    if (!first.ok) return { ok: false as const, error: first.error };
    // Publish copies the draft body (`blocks`) into the live body
    // (`blocks_published`). Saving never touches the live body, so an edit to a
    // published page stays private until this runs.
    const result = await publishTalentPageBodies(sb, { talentProfileId, pageId });
    if (!result.ok) return { ok: false as const, error: result.error };
    const page = result.pages[0];
    if (!page) return { ok: false as const, error: "Talent page publish failed." };
    // F134: the shared shell + theme tokens go live with the page when their
    // drafts differ (a theme update rewrites them too); the chip counts them.
    if (!first.delegated) {
      const chrome = await publishSiteChromeWithPage(sb, talentProfileId);
      if (!chrome.ok) return { ok: false as const, error: chrome.error };
    }
    const admin = createServiceRoleClient();
    const site = admin ? await loadSiteRev(admin, talentProfileId) : null;
    // The site publish already wrote the history entry when it ran.
    if (admin && site && !first.delegated) {
      const summary = summaryFor("publish");
      await recordSiteHistory(admin, site.siteId, {
        kind: "publish",
        summaryEn: summary.en,
        summaryEs: summary.es,
        source: "published",
        ...(pageHash ? { report: { contentHash: pageHash } } : {}),
      });
    }
    return {
      ok: true as const,
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      draftRev: site?.draftRev ?? null,
    };
  } catch (err) {
    logServerError("talentPageAdapter/publishPage", err);
    return { ok: false as const, error: "Unexpected error publishing talent page." };
  }
}

export async function restoreTalentPageRevisionAction(
  input: Parameters<NonNullable<TalentPageAdapterActions["restoreRevision"]>>[0],
): ReturnType<NonNullable<TalentPageAdapterActions["restoreRevision"]>> {
  await requireNotImpersonating();
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

    // PHASE 1 — a restore writes a tree, so it is the same chokepoint as a
    // save and carries the same rule. Without it, a lapsed Web Office talent
    // could reinstate the sections the save path refuses simply by restoring
    // an older revision. `null` = the free-site rules do not apply.
    const siteCaps = await loadTalentSiteSaveCapabilities(talentProfileId);
    if (siteCaps) {
      const structural = assertFreeTalentSiteTreeMutation({
        previousTree: (live as { blocks: unknown } | null)?.blocks,
        nextTree: restoredBlocks,
        canInsertSections: siteCaps.personalSiteSections,
      });
      if (!structural.ok) {
        return { ok: false as const, error: structural.message };
      }
    }

    {
      const premiumErr = await refuseTalentPremiumAppTreeMutation({
        talentProfileId,
        previousTree: (live as { blocks: unknown } | null)?.blocks,
        nextTree: restoredBlocks,
        locale: await getRequestLocale(),
      });
      if (premiumErr) {
        return { ok: false as const, error: premiumErr };
      }
    }

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
