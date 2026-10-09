/**
 * THEME RELEASES: which release item lets the merge make a given change.
 *
 *   node    a keyed node's design-owned props   variant-default, layout, copy, critical
 *   copy    a node's default text + translations  copy, critical
 *   remove  drop a node the design removed       layout, critical
 *   new     insert a key new in the design       new-block, layout, critical
 *   order   reorder a sibling list               layout, critical
 *   token   a token default                      token-default, critical
 *
 * An item covers `keys` when given, else its `key` (`"*"` = every key; a
 * key may be written `tree:key`). No items = the whole update is allowed. `code` items never change a tree
 * (they ship with the deploy). A `critical` item forces its change even over
 * a talent edit; restoring a node the talent removed needs the critical item
 * to name that key explicitly.
 */
import type { ReleaseItem, ReleaseItemType } from "./types";

export type ChangeScope = "node" | "remove" | "new" | "order" | "token" | "copy";

export interface Allowance {
  ok: boolean;
  critical: boolean;
  /** The critical item names this key explicitly (not a wildcard). */
  explicitCritical: boolean;
  itemId?: string;
  itemType?: ReleaseItemType;
}

const SCOPE_TYPES: Record<ChangeScope, ReadonlyArray<ReleaseItemType>> = {
  node: ["variant-default", "layout", "copy", "critical"],
  // Copy leaves are written ONLY under an item of type `copy` naming the node
  // (or `critical`, which still never overwrites a text she changed).
  copy: ["copy", "critical"],
  remove: ["layout", "critical"],
  new: ["new-block", "layout", "critical"],
  order: ["layout", "critical"],
  token: ["token-default", "critical"],
};

export type AllowFn = (scope: ChangeScope, key: string, tree?: string) => Allowance;

function covers(list: ReadonlyArray<string> | undefined, key: string, tree?: string): "all" | "named" | null {
  if (!list) return "all";
  if (list.includes(key)) return "named";
  if (tree && list.includes(`${tree}:${key}`)) return "named";
  return null;
}

export function makeAllow(items: ReadonlyArray<ReleaseItem> | undefined): AllowFn {
  return (scope, key, tree) => {
    if (!items) return { ok: true, critical: false, explicitCritical: false };
    let result: Allowance = { ok: false, critical: false, explicitCritical: false };
    for (const item of items) {
      if (!SCOPE_TYPES[scope].includes(item.type)) continue;
      if (scope !== "token" && item.tree && tree && item.tree !== tree) continue;
      const single = !item.key || item.key === "*" ? undefined : [item.key];
      const list = (scope === "token" ? item.tokenKeys : item.keys) ?? single;
      const hit = covers(list, key, tree);
      if (!hit) continue;
      const itemId = item.id ?? `${item.type}:${item.key}`;
      if (item.type === "critical") {
        return { ok: true, critical: true, explicitCritical: hit === "named", itemId, itemType: item.type };
      }
      if (!result.ok) result = { ok: true, critical: false, explicitCritical: false, itemId, itemType: item.type };
    }
    return result;
  };
}
