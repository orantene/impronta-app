/**
 * default-template-chain — the PURE fallback-ordering for the platform DEFAULT
 * surfaces (Builder Lab → Default surfaces).
 *
 * The render path for both the DEFAULT storefront and the DEFAULT talent profile
 * resolves a builder tree through a 3-link chain:
 *
 *   1. POINTER  — the published template a super-admin pointed the default at
 *                 (`platform_settings.default_*_template_id`), if any.
 *   2. SLUG     — the reserved-slug template (`__platform_default_*__`).
 *   3. BUILT-IN — a code-defined fallback tree (storefront: `null` → the caller
 *                 keeps `DefaultStorefrontBody`; talent: the built-in tree).
 *
 * This module holds ONLY the ordering as a pure async combinator over injected
 * loaders so it is unit-testable with no DB. Each loader returns a non-empty
 * tree or `null`/empty; the first non-empty wins. A loader that throws is
 * treated as "absent" (caught) so the chain never throws — the public render
 * path must always degrade safely.
 *
 * With no pointer + no published reserved-slug row, the chain returns the
 * built-in fallback (or `null`) — byte-identical to the pre-pointer behaviour.
 */

/** A tree loader: returns the surface's builder tree, or null/empty when absent. */
export type TreeLoader<TNode> = () => Promise<ReadonlyArray<TNode> | null>;

function nonEmpty<TNode>(
  tree: ReadonlyArray<TNode> | null | undefined,
): ReadonlyArray<TNode> | null {
  return Array.isArray(tree) && tree.length > 0 ? tree : null;
}

/** Run one loader; treat a throw as "absent" (null) so the chain never throws. */
async function safeLoad<TNode>(
  loader: TreeLoader<TNode> | null | undefined,
): Promise<ReadonlyArray<TNode> | null> {
  if (!loader) return null;
  try {
    return nonEmpty(await loader());
  } catch {
    return null;
  }
}

/**
 * Resolve the first non-empty tree in pointer → slug → built-in order.
 *
 * `pointer` is only attempted when a pointer id is set (`pointerId` truthy);
 * otherwise the chain starts at the reserved slug. `builtIn` is the last-resort
 * synchronous tree (may be null — e.g. the storefront has no code tree, so the
 * caller keeps its own legacy fallback).
 */
export async function resolveDefaultTemplateTree<TNode>(input: {
  pointerId: string | null | undefined;
  loadPointer: TreeLoader<TNode> | null;
  loadSlug: TreeLoader<TNode> | null;
  builtIn: ReadonlyArray<TNode> | null;
}): Promise<ReadonlyArray<TNode> | null> {
  if (input.pointerId) {
    const fromPointer = await safeLoad(input.loadPointer);
    if (fromPointer) return fromPointer;
  }
  const fromSlug = await safeLoad(input.loadSlug);
  if (fromSlug) return fromSlug;
  return nonEmpty(input.builtIn);
}
