/**
 * TUL-1634: what a workspace Menu write does AFTER the row is stored, the same
 * side effects a talent service write runs (offerings-actions.ts):
 *  - revalidatePath("/") for the workspace pages (kept from before);
 *  - bustTalentSiteCache for the workspace OWNER's talent site (the Max-site
 *    offerings sit behind unstable_cache tagged talent:<id>:site);
 *  - scheduleRebuildAiSearchDocument for that owner talent (deferred +
 *    coalesced, never blocks the response).
 *
 * Which writes rebuild search matches the talent side: save, delete, archive
 * and reorder do; options and photos bust the cache only (setOfferingOptions /
 * setOfferingImages do not rebuild either).
 *
 * A side effect can never lose the saved item: each one runs in its own
 * try/catch, logs, and the caller still returns the stored row. A workspace
 * with no owner talent profile has no talent site and no AI document, so only
 * the path revalidation runs.
 *
 * Dependencies are injected (no next/cache import here) so the behaviour is
 * tested without a Next request; menu-offerings-actions.ts wires the real ones.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MenuWriteKind = "save" | "delete" | "archive" | "reorder" | "options" | "photos";

export type MenuSideEffectDeps = {
  revalidatePath: (path: string) => void;
  bustTalentSiteCache: (talentProfileId: string, profileCode: string | null) => void;
  scheduleRebuildAiSearchDocument: (admin: SupabaseClient, talentProfileId: string) => Promise<void>;
  logServerError: (scope: string, err: unknown) => void;
};

const REBUILDS_SEARCH: Record<MenuWriteKind, boolean> = {
  save: true,
  delete: true,
  archive: true,
  reorder: true,
  options: false,
  photos: false,
};

/** The admin path each write revalidates (photos only ever revalidated the editor route). */
const PATH: Record<MenuWriteKind, string> = {
  save: "/",
  delete: "/",
  archive: "/",
  reorder: "/",
  options: "/",
  photos: "/admin/menu",
};

/** Run the post-write side effects. Never throws. */
export async function runMenuWriteSideEffects(
  admin: unknown,
  input: { kind: MenuWriteKind; ownerTalentId: string | null },
  deps: MenuSideEffectDeps,
): Promise<void> {
  const scope = `menu.offerings.sideEffects.${input.kind}`;
  try {
    deps.revalidatePath(PATH[input.kind]);
  } catch (err) {
    deps.logServerError(`${scope}.revalidate`, err);
  }
  const owner = input.ownerTalentId;
  if (!owner) return;
  try {
    deps.bustTalentSiteCache(owner, null);
  } catch (err) {
    deps.logServerError(`${scope}.cache`, err);
  }
  if (!REBUILDS_SEARCH[input.kind]) return;
  try {
    await deps.scheduleRebuildAiSearchDocument(admin as SupabaseClient, owner);
  } catch (err) {
    deps.logServerError(`${scope}.search`, err);
  }
}
