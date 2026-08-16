import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * Fresh-master resolution for the panel "sync" flows (pure, dependency-injected
 * so it unit-tests without a DOM or a server action import).
 *
 * WHY THIS EXISTS — the bug it fixes: both component panels used to call
 * `syncComponentInstances(component.id, JSON.stringify(component.subtree))`
 * with the row from their LAST LIST FETCH. In the "Update master" flow that
 * row is by definition one version behind the master that was just pushed, so
 * the open page's instances were re-synced to the PRE-update content: the
 * editor canvas showed the old design while every published page showed the
 * new one, under a success message claiming the sync happened. Any sync that
 * writes stored children must therefore re-read the master from the server
 * first — never from panel state.
 */

export interface MasterRowLike {
  id: string;
  subtree: BuilderNode;
}

export type ListComponentsLike = () => Promise<
  | { ok: true; components: ReadonlyArray<MasterRowLike> }
  | { ok: false; error: string }
>;

/**
 * Re-fetch the component list and return the CURRENT master subtree of
 * `componentId` as JSON, or null when it can't be resolved (list failed, or
 * the component was archived meanwhile). Callers must treat null as "do not
 * sync" — syncing from a stale in-memory copy is exactly the bug above.
 */
export async function fetchFreshMasterSubtreeJson(
  componentId: string,
  listComponents: ListComponentsLike,
): Promise<string | null> {
  let result: Awaited<ReturnType<ListComponentsLike>>;
  try {
    result = await listComponents();
  } catch {
    return null;
  }
  if (!result.ok) return null;
  const row = result.components.find((c) => c.id === componentId);
  return row ? JSON.stringify(row.subtree) : null;
}
