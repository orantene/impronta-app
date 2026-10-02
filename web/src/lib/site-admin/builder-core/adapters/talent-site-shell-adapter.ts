/**
 * Talent-site SHELL adapter — the production binding.
 *
 * Persists the freeform shell `builderTree` to `talent_sites.shell_tree` (draft)
 * and publishes by baking `shell_tree → shell_published`. NOT a "use server"
 * file (it exports a non-async factory), so it binds the real DB mutations that
 * live as "use server" actions in `talent-site-shell-actions.ts` — the client
 * editor mount can import this factory while DB access stays behind the
 * server-action boundary. Mirrors the agency `site-shell-adapter` binding.
 *
 * Owner + Max gating is server-enforced inside the bound actions; `talent_sites`
 * RLS independently allows only the owner to write.
 */

import {
  createTalentSiteShellAdapter,
  type TalentSiteShellAdapterActions,
} from "./talent-site-shell-adapter-core";
import {
  loadTalentSiteShellRow,
  saveTalentSiteShellRow,
  publishTalentSiteShellRow,
  restoreTalentSiteShellRevisionAction,
  loadTalentSiteShellRevisionsAction,
} from "./talent-site-shell-actions";
import {
  loadTalentHistoryAction,
  restoreTalentHistoryAction,
} from "@/lib/talent-site/history/history-actions";

export {
  createTalentSiteShellAdapter,
  buildTalentSiteShellComposition,
  type TalentSiteShellAdapterActions,
  type TalentSiteShellRow,
} from "./talent-site-shell-adapter-core";

/** Production action surface — bound to the talent-site_shell "use server"
 *  actions so the owner+Max gate + talent_sites RLS take effect on every call. */
const productionActions: TalentSiteShellAdapterActions = {
  loadShell: loadTalentSiteShellRow,
  saveShell: saveTalentSiteShellRow,
  publishShell: publishTalentSiteShellRow,
  // REV-1 — restore a saved shell revision's freeform tree onto the draft
  // (re-asserting admin locks). Binding it makes the adapter expose
  // `restoreRevision`, closing the talent-site-shell parity gap (the shared
  // `buildSiteShellBuilderConfig` already sets `canRestoreRevision: true`, so
  // the RevisionsDrawer becomes functional instead of a silent no-op).
  //
  // Theme releases Phase 2 — the drawer now lists the SITE's history timeline
  // (`loadTimeline` below), so restore targets a history entry: the snapshot
  // lands on the draft as a new entry, nothing is deleted. A legacy shell
  // revision id (pre-timeline tab) still restores through REV-1.
  restoreRevision: async ({ talentProfileId, revisionId, expectedDraftRev }) => {
    const res = await restoreTalentHistoryAction({
      entryId: revisionId,
      expectedDraftRev: expectedDraftRev ?? null,
    });
    if (res.ok) return { ok: true, updatedAt: new Date().toISOString(), draftRev: res.draftRev };
    if (res.code === "not_found") {
      return restoreTalentSiteShellRevisionAction({ talentProfileId, revisionId });
    }
    return { ok: false, error: res.error, code: res.code };
  },
  // REV-1b — OWNER-gated revision LIST read. Binding it makes the adapter expose
  // `loadRevisions`, which the RevisionsDrawer prefers over its staff-gated
  // homepage/cms_page default. Without this, the talent-site shell editor (no
  // pageSlug) falls through to the staff-gated homepage loader and the drawer
  // renders empty — a talent could RESTORE (REV-1) but never SEE the list.
  loadShellRevisions: loadTalentSiteShellRevisionsAction,
  loadTimeline: () => loadTalentHistoryAction({ pageSlug: null }),
};

/**
 * Create a talent-site_shell adapter bound to a specific talent profile id.
 * Persists the freeform shell tree to `talent_sites.shell_tree`; NEVER writes
 * `cms_pages` / `cms_page_sections`.
 */
export function createBoundTalentSiteShellAdapter(talentProfileId: string) {
  return createTalentSiteShellAdapter(productionActions, { talentProfileId });
}
