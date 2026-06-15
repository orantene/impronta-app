/**
 * Builder Studio — per-PROP locking (Wave 0 primitive).
 *
 * Extends the proven per-NODE `locked` mechanism to individual props. A node
 * carries `lockedProps: string[]` (dot-paths, e.g. `"tone"`, `"style.textColor"`).
 * Locked props are:
 *   - shown read-only / disabled in the inspector (advisory UI), and
 *   - re-asserted server-trustedly in `patchBuilderNodeProps` (the single
 *     mutation chokepoint), which STRIPS any locked key from an incoming patch
 *     so a programmatic / optimistic edit cannot bypass a disabled input.
 *
 * Locks are ADVISORY over the *value*: they never remove the prop value, only
 * block edits to it ("admin locks the look, tenant fills the copy").
 *
 * Pure + client-safe (no I/O) so both `operations.ts` and the client inspector
 * import it.
 */

/** Does this node lock `key` (a top-level prop or a `a.b.c` dot-path)? */
export function isPropLocked(
  node: { lockedProps?: readonly string[] | null } | null | undefined,
  key: string,
): boolean {
  const locked = node?.lockedProps;
  return Array.isArray(locked) && locked.includes(key);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Restore a single nested leaf (`segs`) inside `patchVal` from `currentVal`,
 * returning a NEW object so the caller's patch isn't mutated. When the current
 * value has no such leaf, the leaf is removed from the patch (so the wholesale
 * merge falls back to the current value).
 */
function restoreLeaf(
  patchVal: unknown,
  currentVal: unknown,
  segs: string[],
): unknown {
  const patchObj: Record<string, unknown> = isPlainObject(patchVal)
    ? { ...patchVal }
    : {};
  const currentObj = isPlainObject(currentVal) ? currentVal : undefined;
  if (segs.length === 1) {
    const leaf = segs[0];
    const cur = currentObj ? currentObj[leaf] : undefined;
    if (cur === undefined) delete patchObj[leaf];
    else patchObj[leaf] = cur;
    return patchObj;
  }
  patchObj[segs[0]] = restoreLeaf(
    patchObj[segs[0]],
    currentObj?.[segs[0]],
    segs.slice(1),
  );
  return patchObj;
}

/**
 * Strip locked keys from a props patch. Top-level locks are deleted (the
 * `{...current, ...patch}` merge then keeps the current value); nested
 * dot-path locks restore the locked leaf from the current props (because a
 * style patch replaces the whole `style` object wholesale). Returns a new
 * patch; never mutates the input.
 */
export function stripLockedKeysFromPatch(
  patch: Record<string, unknown>,
  currentProps: Record<string, unknown>,
  lockedProps: readonly string[] | null | undefined,
): Record<string, unknown> {
  if (!Array.isArray(lockedProps) || lockedProps.length === 0) return patch;
  const out: Record<string, unknown> = { ...patch };
  for (const path of lockedProps) {
    if (typeof path !== "string" || path.length === 0) continue;
    const segs = path.split(".");
    if (segs.length === 1) {
      // Top-level locked prop → drop it so the merge keeps the current value.
      if (segs[0] in out) delete out[segs[0]];
      continue;
    }
    const top = segs[0];
    // Patch doesn't touch the locked branch → the merge keeps current wholesale.
    if (!(top in out)) continue;
    out[top] = restoreLeaf(out[top], currentProps[top], segs.slice(1));
  }
  return out;
}
