/**
 * Workspace-page surface adapter (WS6) — the production binding.
 *
 * Persists the freeform `builderTree` to `workspace_pages.blocks`.
 *
 * This module is NOT a "use server" file: it exports a non-async factory
 * (`createBoundWorkspacePageAdapter`) + re-exports types, which a "use server"
 * file forbids. It binds the real DB mutations, which live as individual
 * "use server" actions in `workspace-page-actions.ts`. This mirrors how the
 * homepage adapter binds the "use server" composition actions — so the client
 * editor (`WorkspaceBuilderMount`) can import the factory while the actual DB
 * access stays behind the server-action boundary.
 *
 * NEVER writes `cms_page_sections` / `composition[]` — enforced by
 * `assertNoLegacyBuilderWrite("workspace_page", "workspace_pages")` in the core
 * factory + the CI static grep guard.
 *
 * The pure DI factory lives in `workspace-page-adapter-core.ts` (no runtime
 * imports), so the spy test can import and drive it with mock actions.
 */

import {
  createWorkspacePageAdapter,
  type WorkspacePageAdapterActions,
} from "./workspace-page-adapter-core";
import {
  loadWorkspacePageAction,
  saveWorkspacePageAction,
  publishWorkspacePageAction,
  restoreWorkspacePageRevisionAction,
} from "./workspace-page-actions";

export {
  createWorkspacePageAdapter,
  buildEmptyWorkspacePageComposition,
  type WorkspacePageAdapterActions,
  type WorkspacePageRow,
} from "./workspace-page-adapter-core";

/** Production action surface — bound to the workspace_page "use server" actions
 *  so workspace_pages RLS (is_staff_of_tenant) takes effect on every call. */
const productionActions: WorkspacePageAdapterActions = {
  loadPage: loadWorkspacePageAction,
  savePage: saveWorkspacePageAction,
  publishPage: publishWorkspacePageAction,
  restoreRevision: restoreWorkspacePageRevisionAction,
};

/**
 * Create a workspace_page adapter bound to a specific tenant. Persists the
 * freeform builderTree to `workspace_pages.blocks`; NEVER writes
 * `cms_page_sections`.
 */
export function createBoundWorkspacePageAdapter(tenantId: string) {
  return createWorkspacePageAdapter(productionActions, { tenantId });
}
