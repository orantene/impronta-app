/**
 * CMS-page FREEFORM surface adapter (Wave 4.1) — the production binding.
 *
 * Persists the freeform `builderTree` to `cms_pages.blocks` for pages flagged
 * `is_freeform = true`. NOT a "use server" file (it exports a non-async factory),
 * so it binds the real DB mutations that live as "use server" actions in
 * `cms-page-actions.ts` — mirroring how the homepage adapter binds its
 * composition actions, so the storefront `?edit=1` editor can import the factory
 * while DB access stays behind the server-action boundary.
 *
 * NEVER writes `cms_page_sections` — enforced by
 * `assertNoLegacyBuilderWrite("cms_page", "cms_pages")` in the core factory +
 * the CI static grep guard. The homepage + system + legacy slot pages keep using
 * the `homepage` adapter; only `is_freeform` pages route here.
 */

import {
  createCmsPageAdapter,
  type CmsPageAdapterActions,
} from "./cms-page-adapter-core";
import {
  loadCmsFreeformPage,
  loadCmsFreeformLocaleSettings,
  saveCmsFreeformPage,
  publishCmsFreeformPage,
  restoreCmsFreeformRevisionAction,
} from "./cms-page-actions";

export {
  createCmsPageAdapter,
  buildCmsFreeformComposition,
  type CmsPageAdapterActions,
  type CmsFreeformPageRow,
} from "./cms-page-adapter-core";

/** Production action surface — bound to the cms_page freeform "use server"
 *  actions so cms_pages RLS (tenant staff) takes effect on every call. */
const productionActions: CmsPageAdapterActions = {
  loadPage: loadCmsFreeformPage,
  // ONE DESIGN PER PAGE — lets the adapter open/save the primary-language row
  // in every language, and report the full language set so the inspector's
  // per-element translation tabs render.
  loadLocaleSettings: loadCmsFreeformLocaleSettings,
  savePage: saveCmsFreeformPage,
  publishPage: publishCmsFreeformPage,
  // REV-1 — restore a saved freeform revision's tree onto the live page
  // (re-asserting admin locks). The core factory already supported the slot
  // (cms-page-adapter-core.ts) but the production binding omitted it — that gap
  // meant non-homepage freeform pages silently couldn't restore. Binding it
  // makes the adapter expose `restoreRevision`, so the shared RevisionsDrawer
  // works on cms freeform pages exactly like the homepage + site shell.
  restoreRevision: restoreCmsFreeformRevisionAction,
};

/** Create a cms_page freeform adapter bound to the production actions. */
export function createBoundCmsPageAdapter() {
  return createCmsPageAdapter(productionActions);
}
