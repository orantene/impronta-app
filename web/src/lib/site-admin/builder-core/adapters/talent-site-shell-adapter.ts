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
  restoreRevision: restoreTalentSiteShellRevisionAction,
  // REV-1b — OWNER-gated revision LIST read. Binding it makes the adapter expose
  // `loadRevisions`, which the RevisionsDrawer prefers over its staff-gated
  // homepage/cms_page default. Without this, the talent-site shell editor (no
  // pageSlug) falls through to the staff-gated homepage loader and the drawer
  // renders empty — a talent could RESTORE (REV-1) but never SEE the list.
  loadShellRevisions: loadTalentSiteShellRevisionsAction,
};

/**
 * Create a talent-site_shell adapter bound to a specific talent profile id.
 * Persists the freeform shell tree to `talent_sites.shell_tree`; NEVER writes
 * `cms_pages` / `cms_page_sections`.
 */
export function createBoundTalentSiteShellAdapter(talentProfileId: string) {
  return createTalentSiteShellAdapter(productionActions, { talentProfileId });
}
