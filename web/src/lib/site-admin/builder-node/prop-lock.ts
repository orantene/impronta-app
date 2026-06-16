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
  // The lock carrier itself is admin-owned — a locked node's tenant must not be
  // able to clear its locks by patching `{ lockedProps: [] }`. Drop the carrier
  // from any patch on a locked node (the base field is re-asserted elsewhere).
  if ("lockedProps" in out) delete out.lockedProps;
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

// ── Server-side full-tree enforcement (WS-C C1 hardening) ────────────────────
//
// `stripLockedKeysFromPatch` guards single-node INSPECTOR patches. But the
// editor also persists the WHOLE tree (talent_pages.blocks / cms_pages.blocks),
// and that save path trusts whatever tree the client sends — so a tenant could
// edit a locked prop in devtools and save it. The functions below are the
// SERVER-TRUSTED enforcement for that path: given the incoming tree and the
// current (DB) tree, every locked path is forced back to its current value and
// the lock carrier is re-asserted. Pure + client-safe (no I/O), structurally
// typed so they don't depend on the full BuilderNode union.

/** Minimal node shape these helpers need; a real BuilderNode satisfies it. */
export interface LockableNode {
  id: string;
  props?: Record<string, unknown> | null;
  children?: LockableNode[] | null;
  lockedProps?: readonly string[] | null;
}

function normalizeLockKeys(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k === "string" && k.length > 0 && !out.includes(k)) out.push(k);
  }
  return out;
}

function baseLockKeys(node: { lockedProps?: readonly string[] | null }): readonly unknown[] {
  return Array.isArray(node.lockedProps) ? node.lockedProps : [];
}

function propsLockKeys(node: { props?: Record<string, unknown> | null }): readonly unknown[] {
  const carrier =
    node.props && Array.isArray((node.props as { lockedProps?: unknown }).lockedProps)
      ? ((node.props as { lockedProps?: unknown[] }).lockedProps as unknown[])
      : null;
  return carrier ?? [];
}

/** The trusted lock list for a node — base field first, then the props carrier. */
function readNodeLocks(node: {
  lockedProps?: readonly string[] | null;
  props?: Record<string, unknown> | null;
}): string[] {
  const raw = Array.isArray(node.lockedProps) ? node.lockedProps : propsLockKeys(node);
  return normalizeLockKeys(raw);
}

/**
 * The trusted lock list for a BRAND-NEW (un-persisted) node — the UNION of its
 * base field and its `props.lockedProps` carrier, de-duped + normalized.
 *
 * For a DB-matched node we deliberately prefer the DB carrier (a client that
 * dropped the carrier can't shed the lock). But a new node has no DB row, so
 * BOTH carriers are client-supplied — and a crafted save could split locks
 * across base vs props so the legitimate union is under-declared in the first
 * persisted row. Taking the union (never less than either) means a new locked
 * node can never persist FEWER locks than it declared in either location, which
 * the second save then enforces locked VALUES against. Strictly strengthens the
 * guard; never narrows it.
 */
function readNewNodeLocks(node: {
  lockedProps?: readonly string[] | null;
  props?: Record<string, unknown> | null;
}): string[] {
  return normalizeLockKeys([...baseLockKeys(node), ...propsLockKeys(node)]);
}

/**
 * Force every locked path on a node's props back to its trusted CURRENT value,
 * leaving unlocked props exactly as supplied. Unlike `stripLockedKeysFromPatch`
 * (which prepares a patch to merge over current), this takes a FULL set of
 * incoming props (a whole-tree save) and returns the reconciled full props.
 */
export function enforceLockedProps(
  incomingProps: Record<string, unknown>,
  currentProps: Record<string, unknown>,
  lockedProps: readonly string[] | null | undefined,
): Record<string, unknown> {
  if (!Array.isArray(lockedProps) || lockedProps.length === 0) return incomingProps;
  const out: Record<string, unknown> = { ...incomingProps };
  for (const path of lockedProps) {
    if (typeof path !== "string" || path.length === 0) continue;
    const segs = path.split(".");
    if (segs.length === 1) {
      const leaf = segs[0];
      if (leaf in currentProps) out[leaf] = currentProps[leaf];
      else delete out[leaf];
      continue;
    }
    // Nested lock → force just the locked leaf from current, keep sibling leaves.
    out[segs[0]] = restoreLeaf(out[segs[0]], currentProps[segs[0]], segs.slice(1));
  }
  return out;
}

/**
 * Walk an incoming builder tree against the current (DB) tree and re-assert
 * every admin lock. For each node matched by id whose CURRENT version carries
 * locks, the locked paths are forced back to the current values and the lock
 * carrier is re-stamped (so a dropped/cleared carrier can't unlock it).
 *
 * FIRST-SAVE HARDENING (WS-C C1 residual) — a freshly-inserted locked node has
 * NO current (DB) counterpart, so there is no prior trusted value to enforce its
 * locked props against on the FIRST save. With C2 the node is inserted carrying
 * the admin `default_props` value + a clean `lockedProps` carrier, so the
 * legitimate first-save baseline IS the admin default. The residual a crafted
 * client could still exploit is the CARRIER: shipping a new locked node whose
 * `lockedProps` carrier disagrees between the base field and the `props` mirror,
 * or carries garbage/duplicate/split entries, so the next save's enforcement
 * keys off an inconsistent / under-declared list. This path takes the UNION of
 * the new node's base + props carriers (`readNewNodeLocks`), normalizes it
 * (valid non-empty, de-duped strings), and RE-ASSERTS the identical normalized
 * list onto BOTH base + `props`, so the first PERSISTED state always has a
 * clean, self-consistent carrier that is never fewer locks than the node
 * declared — which the second save (now matched by id against this DB row)
 * enforces locked VALUES against.
 *
 * Residual that intentionally REMAINS: on the very first save the server cannot
 * enforce the locked-prop VALUE for a brand-new node, because it has no trusted
 * baseline for it — the catalog overlay (which holds the admin default) is not
 * loaded in the save action, and a persisted node carries no catalog-item id to
 * back-map to its governance (kind alone is ambiguous for variant / embed
 * cards). See the PR / commit notes. The exposure is narrow: it requires a
 * devtools-crafted FIRST save before the node is ever persisted, sets only that
 * node's own locked-prop value (not the carrier, which is normalized here), and
 * is corrected on any subsequent legitimate save.
 *
 * Returns a NEW tree; never mutates the inputs. A non-array input is returned
 * unchanged so a malformed/empty save degrades safely.
 */
export function enforceLockedPropsOnTree(
  incomingTree: unknown,
  currentTree: unknown,
): unknown {
  if (!Array.isArray(incomingTree)) return incomingTree;
  const currentById = new Map<string, LockableNode>();
  const index = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes as LockableNode[]) {
      if (n && typeof n === "object" && typeof n.id === "string") {
        currentById.set(n.id, n);
        if (Array.isArray(n.children)) index(n.children);
      }
    }
  };
  index(currentTree);

  const walk = (nodes: LockableNode[]): LockableNode[] =>
    nodes.map((node) => {
      if (!node || typeof node !== "object") return node;
      const current = typeof node.id === "string" ? currentById.get(node.id) : undefined;
      // The trusted lock list comes from the CURRENT (DB) node when it exists —
      // so a client that dropped the carrier can't shed the lock. For a brand-new
      // (un-persisted) node, take the UNION of its base + props carriers so a
      // crafted first save can't under-declare locks by splitting them across the
      // two carrier locations. Either path NORMALIZES the list (valid non-empty,
      // de-duped strings only), so a malformed carrier never reaches the first
      // persisted row.
      const locks = current ? readNodeLocks(current) : readNewNodeLocks(node);
      let out: LockableNode = node;
      if (locks.length > 0) {
        const incomingProps = (node.props as Record<string, unknown>) ?? {};
        // Matched node → enforce locked VALUES back to the trusted DB value.
        // Brand-new node → no prior value to enforce, but the carrier is still
        // normalized + re-asserted on BOTH base and props below (so the first
        // persisted state is self-consistent; the locked value reflects the
        // C2-stamped admin default the insert produced — see header residual).
        const props = current
          ? enforceLockedProps(
              incomingProps,
              (current.props as Record<string, unknown>) ?? {},
              locks,
            )
          : incomingProps;
        out = {
          ...node,
          lockedProps: locks,
          props: { ...props, lockedProps: locks },
        };
      }
      if (Array.isArray(out.children)) {
        out = { ...out, children: walk(out.children) };
      }
      return out;
    });

  return walk(incomingTree as LockableNode[]);
}
