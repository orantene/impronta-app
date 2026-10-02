/**
 * Node ids are render identities, unique across a whole tree. Design payload
 * ids are positional, so a node inserted from a newer payload can collide with
 * one already on a talent's page. These helpers keep ids unique (pure, no I/O).
 * Origin keys (`__origin.key`) are never touched here.
 */

type Loose = { id?: unknown; children?: unknown };

function kidsOf(node: unknown): unknown[] {
  const c = (node as Loose | null)?.children;
  return Array.isArray(c) ? c : [];
}

/** Every id in the tree (children included), in document order, with repeats. */
export function collectNodeIds(tree: ReadonlyArray<unknown>): string[] {
  const out: string[] = [];
  const walk = (nodes: ReadonlyArray<unknown>) => {
    for (const n of nodes) {
      const id = (n as Loose | null)?.id;
      if (typeof id === "string") out.push(id);
      walk(kidsOf(n));
    }
  };
  walk(tree);
  return out;
}

/** Ids that appear more than once in the tree (each listed once). */
export function findDuplicateNodeIds(tree: ReadonlyArray<unknown>): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of collectNodeIds(tree)) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

function nextId(base: string, used: Set<string>): string {
  const stem = base.replace(/-u\d+$/, "");
  let n = 1;
  while (used.has(`${stem}-u${n}`)) n += 1;
  return `${stem}-u${n}`;
}

/**
 * Return `node` with every id (recursively) that is already in `used` replaced
 * by a fresh one. All ids of the returned subtree are added to `used`.
 */
export function freshenNodeIds<T>(node: T, used: Set<string>): T {
  const cur = (node as Loose).id;
  let id = cur;
  if (typeof cur === "string") {
    id = used.has(cur) ? nextId(cur, used) : cur;
    used.add(id as string);
  }
  const hasKids = Array.isArray((node as Loose).children);
  return {
    ...(node as object),
    ...(id !== cur ? { id } : {}),
    ...(hasKids ? { children: kidsOf(node).map((k) => freshenNodeIds(k, used)) } : {}),
  } as T;
}

/**
 * Remap duplicate ids: the first occurrence keeps its id, later ones get a
 * fresh id. Returns the same array when nothing collides.
 */
export function dedupeTreeIds<T>(tree: ReadonlyArray<T>): { tree: T[]; remapped: number } {
  if (findDuplicateNodeIds(tree).length === 0) return { tree: tree as T[], remapped: 0 };
  const all = new Set(collectNodeIds(tree));
  const seen = new Set<string>();
  let remapped = 0;
  const walk = (node: T): T => {
    const cur = (node as Loose).id;
    let id = cur;
    if (typeof cur === "string") {
      if (seen.has(cur)) {
        id = nextId(cur, all);
        all.add(id as string);
        remapped += 1;
      }
      seen.add(id as string);
    }
    const hasKids = Array.isArray((node as Loose).children);
    return {
      ...(node as object),
      ...(id !== cur ? { id } : {}),
      ...(hasKids ? { children: kidsOf(node).map((k) => walk(k as T)) } : {}),
    } as T;
  };
  return { tree: tree.map(walk), remapped };
}
