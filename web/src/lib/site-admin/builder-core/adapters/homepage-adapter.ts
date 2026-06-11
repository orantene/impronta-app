/**
 * Homepage surface adapter — a PURE PASS-THROUGH over the existing four
 * homepage composition actions + the two restore actions.
 *
 * Every method forwards its arguments to the legacy action with NO
 * transformation, so the homepage path through the seam is provably identical
 * to calling those actions directly.
 *
 * The pure DI factory (`createHomepageAdapter`) + its action shape
 * (`HomepageAdapterActions`) live in `homepage-adapter-core.ts`, which has no
 * runtime imports — that is what the parity test imports. THIS module binds the
 * real server actions into the production `homepageAdapter`, so importing it
 * pulls the heavy server-action / DB module graph (expected at runtime).
 *
 * This is the only adapter allowed to write legacy slot composition
 * (`cms_page_sections`) — it IS the frozen legacy homepage path, just wrapped.
 * It therefore does NOT call `assertNoLegacyBuilderWrite` (that guard is for
 * the new freeform surfaces).
 */

import {
  loadHomepageCompositionAction,
  saveHomepageCompositionAction,
  saveDraftHomepageAction,
  publishHomepageFromEditModeAction,
} from "@/lib/site-admin/edit-mode/composition-actions";
import {
  restoreHomepageRevisionAction,
  restorePageRevisionAction,
} from "@/lib/site-admin/edit-mode/revisions-actions";

import type { BuilderSurfaceAdapter } from "../surface-adapter";
import { createHomepageAdapter } from "./homepage-adapter-core";

export { createHomepageAdapter } from "./homepage-adapter-core";
export type { HomepageAdapterActions } from "./homepage-adapter-core";

/** The production homepage adapter — bound to the real homepage server actions. */
export const homepageAdapter: BuilderSurfaceAdapter = createHomepageAdapter({
  load: loadHomepageCompositionAction,
  save: saveHomepageCompositionAction,
  saveDraft: saveDraftHomepageAction,
  publish: publishHomepageFromEditModeAction,
  restoreHomepageRevision: restoreHomepageRevisionAction,
  restorePageRevision: restorePageRevisionAction,
});
