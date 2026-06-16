/**
 * site_shell FREEFORM surface adapter (Builder Studio WS-A A1) — the production
 * binding.
 *
 * Persists the freeform `builderTree` to the dormant `site_shell` `cms_pages`
 * row's `blocks` column and publishes through the existing `site-shell-publish`
 * snapshot path. NOT a "use server" file (it exports a non-async factory), so it
 * binds the real DB mutations that live as "use server" actions in
 * `site-shell-actions.ts` — mirroring how the cms-page adapter binds its
 * actions, so the editor mount can import the factory while DB access stays
 * behind the server-action boundary.
 *
 * NEVER writes `cms_page_sections` — enforced by
 * `assertNoLegacyBuilderWrite("site_shell", "cms_pages")` in the core factory +
 * the CI static grep guard. The dormant slot composition is untouched; only the
 * freeform `blocks` draft + the snapshot's `builderTree` overlay are written.
 *
 * GUARDRAIL: reached ONLY behind `site-shell-flag.ts` (OFF by default). With the
 * flag off NOTHING binds or routes here and the live header/footer render
 * through the legacy `PublicHeader` path.
 */

import {
  createSiteShellAdapter,
  type SiteShellAdapterActions,
} from "./site-shell-adapter-core";
import {
  loadSiteShellRow,
  saveSiteShellRow,
  publishSiteShellRow,
  restoreSiteShellRevisionAction,
} from "./site-shell-actions";

export {
  createSiteShellAdapter,
  buildSiteShellComposition,
  type SiteShellAdapterActions,
  type SiteShellRow,
} from "./site-shell-adapter-core";

/** Production action surface — bound to the site_shell "use server" actions so
 *  cms_pages RLS (tenant staff) takes effect on every call. The publish action
 *  threads the active locale so the snapshot bake targets the right shell row. */
function makeProductionActions(locale: string): SiteShellAdapterActions {
  return {
    loadShell: loadSiteShellRow,
    saveShell: saveSiteShellRow,
    publishShell: ({ pageId }) => publishSiteShellRow({ pageId, locale }),
    // A2 follow-up — restore a saved shell revision's freeform tree onto the
    // draft (re-asserting admin locks). Binding it makes the adapter expose
    // `restoreRevision`, so the shell config can flip `canRestoreRevision: true`.
    restoreRevision: restoreSiteShellRevisionAction,
  };
}

/** Create a site_shell adapter bound to the production actions for `locale`. */
export function createBoundSiteShellAdapter(locale: string) {
  return createSiteShellAdapter(makeProductionActions(locale));
}
