import "server-only";

/**
 * THEME RELEASES (F125): apply the important (critical) fixes of an offer to a
 * site with NO exact merge base, by targeted key match only (never a full
 * merge). One atomic draft write + one undoable history entry; her version pin
 * does not move and the update rows stay (new blocks may still be on offer).
 * The applied item ids are remembered on the covered rows so the offer closes.
 */
import { logServerError } from "@/lib/server/safe-error";
import { applyThemeUpdateToDraft } from "@/lib/talent-site/history/history.server";
import type { DesignMergeReport } from "../types";
import { applyItemsOf, nextTokenOrigin } from "./view";
import { criticalFixSummary } from "./copy";
import { homeTree, loadUpdateContext, type ApplyOutcome, type UpdateDeps, type UpdateResult } from "./talent-update.server";

export async function applyCriticalFix(
  deps: UpdateDeps,
  input: { talentProfileId: string; updateId: string; expectedDraftRev: number | null; actorId: string | null },
): Promise<UpdateResult<ApplyOutcome>> {
  const ctx = await loadUpdateContext(deps.admin, input.talentProfileId, input.updateId);
  if (!ctx) return { ok: false, code: "not_found", error: "This update is no longer available." };
  const m = await deps.merge(ctx, applyItemsOf(ctx.release.items ?? []));
  if (!m.ok) return { ok: false, code: "merge_failed", error: m.error };
  if (!m.noBase) return { ok: false, code: "use_apply", error: "Your site can take the whole update." };
  if (!m.critical || !m.homePageId) return { ok: false, code: "nothing_to_fix", error: "There is nothing to fix." };
  const fix = m.critical;
  const home = fix.trees.home ?? [];
  const refused = await deps.checkTree(ctx, await homeTree(deps.admin, ctx.talentProfileId), home);
  if (refused) return { ok: false, code: "plan_required", error: refused };
  const report: DesignMergeReport = {
    applied: fix.entries,
    added: [],
    kept: [],
    conflicts: [],
    removed: [],
    pending: [],
    restamped: [],
  };
  const summary = criticalFixSummary(ctx.designTitle);
  const res = await applyThemeUpdateToDraft(deps.admin, {
    siteId: ctx.siteId,
    homePageId: m.homePageId,
    expectedDraftRev: input.expectedDraftRev,
    shell: fix.trees.shell ?? [],
    home,
    tokens: fix.tokens,
    report,
    designName: ctx.designTitle,
    fromVersion: null,
    toVersion: null,
    releaseId: ctx.release.id,
    updateId: null,
    actor: "talent",
    kind: "theme_update",
    actorId: input.actorId,
    summary,
    tokenOrigin: nextTokenOrigin(ctx.tokenOrigin, report),
  });
  if (!res.ok) {
    return res.code === "conflict"
      ? { ok: false, code: "VERSION_CONFLICT", error: res.error, currentRev: res.currentRev }
      : { ok: false, code: res.code, error: res.error };
  }
  // Remember what was applied (kept next to the added blocks) so the offer can close.
  const done = [...new Set([...ctx.addedBlocks, ...fix.itemIds])];
  const { error } = await deps.admin
    .from("talent_site_theme_updates")
    .update({ report: { addedBlocks: done }, updated_at: new Date().toISOString() } as never)
    .in("id", ctx.coveredUpdateIds)
    .eq("talent_profile_id", ctx.talentProfileId);
  if (error) logServerError("themeUpdate.criticalFix.record", error);
  return { ok: true, value: { draftRev: res.draftRev, kept: 0, historyId: res.historyId } };
}
