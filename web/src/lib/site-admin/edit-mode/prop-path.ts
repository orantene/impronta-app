/**
 * Walk a section's props tree to map a concrete VALUE back to its path.
 *
 * The inline canvas editor doesn't annotate sections with `data-cms-field`
 * attributes — keeping section components clean of editor concerns — so we
 * resolve DOM → prop at commit time by matching the edit target's original
 * value against the tree. This works as long as text values are
 * approximately unique within a single section (the common case: a hero's
 * eyebrow + headline + subtext are all different strings, a gallery's item
 * captions are all different, etc.).
 *
 * If the match is ambiguous or missing, callers fall back to opening the
 * inspector so the operator can pick the right field by hand.
 */

export type PropPath = ReadonlyArray<string | number>;

export interface FindResult {
  path: PropPath;
  /** Number of times this value appeared in the tree. >1 → ambiguous. */
  occurrences: number;
}

/**
 * Return the first path whose leaf value === target, plus a count of how
 * many leaves matched. Objects are walked depth-first in property-declaration
 * order. Arrays are walked index-ascending.
 */
export function findPathByValue(
  tree: unknown,
  target: string,
): FindResult | null {
  const hits: PropPath[] = [];
  walk(tree, [], (leaf, path) => {
    if (typeof leaf === "string" && leaf === target) {
      hits.push(path);
    }
  });
  if (hits.length === 0) return null;
  return { path: hits[0]!, occurrences: hits.length };
}

/**
 * Return a NEW tree with the leaf at `path` replaced by `newValue`.
 * Path must already exist; missing intermediate keys are an error.
 */
export function setByPath<T>(
  tree: T,
  path: PropPath,
  newValue: unknown,
): T {
  if (path.length === 0) return newValue as T;
  return setInto(tree, path, 0, newValue) as T;
}

function setInto(
  node: unknown,
  path: PropPath,
  idx: number,
  newValue: unknown,
): unknown {
  const key = path[idx]!;
  if (Array.isArray(node)) {
    if (typeof key !== "number") {
      throw new Error(`Expected number key for array at ${path.slice(0, idx).join(".")}`);
    }
    const copy = node.slice();
    copy[key] = idx === path.length - 1 ? newValue : setInto(node[key], path, idx + 1, newValue);
    return copy;
  }
  if (node && typeof node === "object") {
    if (typeof key !== "string") {
      throw new Error(`Expected string key for object at ${path.slice(0, idx).join(".")}`);
    }
    const obj = node as Record<string, unknown>;
    return {
      ...obj,
      [key]: idx === path.length - 1 ? newValue : setInto(obj[key], path, idx + 1, newValue),
    };
  }
  throw new Error(`Cannot descend into primitive at ${path.slice(0, idx).join(".")}`);
}

type Visitor = (leaf: unknown, path: PropPath) => void;

function walk(node: unknown, path: PropPath, visit: Visitor): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walk(node[i], [...path, i], visit);
    }
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, [...path, k], visit);
    }
    return;
  }
  visit(node, path);
}
