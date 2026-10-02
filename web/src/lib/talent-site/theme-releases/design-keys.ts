/**
 * TEMPLATE EDITOR: pinned design keys (`props.designKey`).
 *
 * A Design's node keys (origin.ts) fall back to `segment#ordinal` for
 * un-keyed twins, so an editor that deletes, reorders or inserts a twin
 * shifts its siblings' keys and the release diff reports bogus prop
 * rewrites. Pinning every node's key into `props.designKey` makes keys
 * independent of sibling position. Pure, client-safe.
 *
 *   freezeDesignKeys   pin every node's CURRENT local key (keys unchanged)
 *   ensureDesignKeys   after an edit: keep prev keys by node id, mint new ones
 *   mintDesignKey      `${kind}~${hash(id)}`, unique within its siblings
 *   designKeyIssues    preflight: duplicate keys within a sibling list
 *   stripDesignKeys    drop the pins (talent site trees never carry them)
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../theme-catalog/types";
import {
  DESIGN_KEY_PROP,
  hasKids,
  hashString,
  kidsOf,
  propsOf,
  siblingLocalKeys,
} from "./origin";

type TreeField = "shellTree" | "homeTree";
const TREE_FIELDS: ReadonlyArray<TreeField> = ["shellTree", "homeTree"];

/** Set (or with `undefined` remove) the pin, keeping the base mirror in step. */
export function withDesignKey(node: BuilderNode, key: string | undefined): BuilderNode {
  const props = { ...propsOf(node) };
  if (key) props[DESIGN_KEY_PROP] = key;
  else delete props[DESIGN_KEY_PROP];
  const out = { ...node, props } as Record<string, unknown>;
  if (key && DESIGN_KEY_PROP in node) out[DESIGN_KEY_PROP] = key;
  else if (!key) delete out[DESIGN_KEY_PROP];
  return out as unknown as BuilderNode;
}

function mapLists(
  tree: ReadonlyArray<BuilderNode>,
  fn: (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null) => BuilderNode[],
): BuilderNode[] {
  const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null): BuilderNode[] => {
    const locals = siblingLocalKeys(nodes);
    const next = fn(nodes, parentKey);
    return next.map((node, i) => {
      if (!hasKids(node)) return node;
      const key = parentKey ? `${parentKey}/${locals[i]!}` : locals[i]!;
      return { ...node, children: visit(kidsOf(node), key) } as BuilderNode;
    });
  };
  return visit(tree, null);
}

function mapPayload(payload: DesignPayload, fn: (tree: BuilderNode[]) => BuilderNode[]): DesignPayload {
  const out: DesignPayload = { ...payload };
  for (const f of TREE_FIELDS) out[f] = fn(payload[f]);
  return out;
}

/** Pin every node's current computed local key. Stamped keys are unchanged. */
export function freezeDesignKeys(payload: DesignPayload): DesignPayload {
  return mapPayload(payload, (tree) =>
    mapLists(tree, (nodes) => {
      const locals = siblingLocalKeys(nodes);
      return nodes.map((n, i) => withDesignKey(n, locals[i]!));
    }),
  );
}

/** Remove every pin from a tree. Pure. */
export function stripDesignKeys(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return tree.map((node) => {
    const next = withDesignKey(node, undefined);
    return hasKids(node) ? ({ ...next, children: stripDesignKeys(kidsOf(node)) } as BuilderNode) : next;
  });
}

/** `${kind}~${hash(id)}`, re-salted until it is not in `takenKeys`. */
export function mintDesignKey(node: BuilderNode, takenKeys: ReadonlySet<string>): string {
  for (let salt = 0; ; salt += 1) {
    const key = `${node.kind}~${hashString(salt === 0 ? node.id : `${node.id}#${salt}`).slice(0, 7)}`;
    if (!takenKeys.has(key)) return key;
  }
}

interface PrevKey {
  local: string;
  parentKey: string | null;
}

function indexPrev(tree: ReadonlyArray<BuilderNode>): Map<string, PrevKey> {
  const out = new Map<string, PrevKey>();
  const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null) => {
    const locals = siblingLocalKeys(nodes);
    nodes.forEach((n, i) => {
      if (!out.has(n.id)) out.set(n.id, { local: locals[i]!, parentKey });
      if (hasKids(n)) visit(kidsOf(n), parentKey ? `${parentKey}/${locals[i]!}` : locals[i]!);
    });
  };
  visit(tree, null);
  return out;
}

/**
 * Pin every node of `next`: a node whose id existed in `prev` keeps its prev
 * local key; a new node gets a minted key. When two nodes in one sibling list
 * claim the same key, the one that held it in `prev` under the same parent
 * keeps it (else the first), the others are re-minted. Pure.
 */
export function ensureDesignKeys(prev: DesignPayload | null | undefined, next: DesignPayload): DesignPayload {
  const out: DesignPayload = { ...next };
  for (const f of TREE_FIELDS) {
    const prevIndex = indexPrev(prev?.[f] ?? []);
    const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null): BuilderNode[] => {
      const claims = nodes.map((n) => prevIndex.get(n.id));
      const winners = new Map<string, number>();
      claims.forEach((c, i) => {
        if (!c) return;
        const held = winners.get(c.local);
        const heldHere = held !== undefined && claims[held]!.parentKey === parentKey;
        if (held === undefined || (!heldHere && c.parentKey === parentKey)) winners.set(c.local, i);
      });
      const taken = new Set(winners.keys());
      const locals = nodes.map((n, i) => {
        const c = claims[i];
        if (c && winners.get(c.local) === i) return c.local;
        const minted = mintDesignKey(n, taken);
        taken.add(minted);
        return minted;
      });
      return nodes.map((n, i) => {
        const pinned = withDesignKey(n, locals[i]!);
        if (!hasKids(n)) return pinned;
        const key = parentKey ? `${parentKey}/${locals[i]!}` : locals[i]!;
        return { ...pinned, children: visit(kidsOf(n), key) } as BuilderNode;
      });
    };
    out[f] = visit(next[f], null);
  }
  return out;
}

export interface DesignKeyIssue {
  tree: TreeField;
  /** Full key of the parent (null at the top level). */
  parentKey: string | null;
  key: string;
  nodeIds: string[];
}

/** Preflight: local keys shared by more than one node in a sibling list. */
export function designKeyIssues(payload: DesignPayload): DesignKeyIssue[] {
  const out: DesignKeyIssue[] = [];
  for (const tree of TREE_FIELDS) {
    const visit = (nodes: ReadonlyArray<BuilderNode>, parentKey: string | null) => {
      const locals = siblingLocalKeys(nodes);
      const byKey = new Map<string, string[]>();
      locals.forEach((k, i) => byKey.set(k, [...(byKey.get(k) ?? []), nodes[i]!.id]));
      for (const [key, nodeIds] of byKey) if (nodeIds.length > 1) out.push({ tree, parentKey, key, nodeIds });
      nodes.forEach((n, i) => {
        if (hasKids(n)) visit(kidsOf(n), parentKey ? `${parentKey}/${locals[i]!}` : locals[i]!);
      });
    };
    visit(payload[tree] ?? [], null);
  }
  return out;
}
