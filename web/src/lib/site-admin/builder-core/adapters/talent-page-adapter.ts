/**
 * Talent-page surface adapter (WS6) — the production binding.
 *
 * Persists the freeform `builderTree` to `talent_pages.blocks`.
 *
 * This module is NOT a "use server" file: it exports a non-async factory
 * (`createBoundTalentPageAdapter`) + re-exports types, which a "use server"
 * file forbids. It binds the real DB mutations, which live as individual
 * "use server" actions in `talent-page-actions.ts`. This mirrors how the
 * homepage adapter binds the "use server" composition actions — so the client
 * editor (`TalentMaxBuilderMount`) can import the factory while the DB access
 * stays behind the server-action boundary.
 *
 * NEVER writes `cms_page_sections` / `composition[]` — enforced by
 * `assertNoLegacyBuilderWrite("talent_page", "talent_pages")` in the core
 * factory + the CI static grep guard.
 *
 * Plan/tier gating (§E) is server-enforced upstream (TalentMaxBuilderMount gates
 * the editor behind tier checks) + by RLS (only the talent owner + workspace
 * staff may write).
 *
 * The pure DI factory lives in `talent-page-adapter-core.ts` (no runtime
 * imports), so the spy test can drive it with mock actions.
 */

import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
} from "./talent-page-adapter-core";
import {
  ensureTalentPageAction,
  loadTalentPageAction,
  saveTalentPageAction,
  publishTalentPageAction,
  restoreTalentPageRevisionAction,
} from "./talent-page-actions";

export {
  createTalentPageAdapter,
  buildEmptyTalentPageComposition,
  type TalentPageAdapterActions,
  type TalentPageRow,
} from "./talent-page-adapter-core";

/** Production action surface — bound to the talent_page "use server" actions so
 *  talent_pages RLS (owner + workspace staff) takes effect on every call. */
const productionActions: TalentPageAdapterActions = {
  ensurePage: ensureTalentPageAction,
  loadPage: loadTalentPageAction,
  savePage: saveTalentPageAction,
  publishPage: publishTalentPageAction,
  restoreRevision: restoreTalentPageRevisionAction,
};

/**
 * Create a talent_page adapter bound to a specific talent profile id. Persists
 * the freeform builderTree to `talent_pages.blocks`; NEVER writes
 * `cms_page_sections`.
 */
export function createBoundTalentPageAdapter(talentProfileId: string) {
  return createTalentPageAdapter(productionActions, { talentProfileId });
}
