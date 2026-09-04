/**
 * C11 — `anchorId`: the optional DOM `id` a builder node may carry, so an
 * in-page anchor (`href="#menu"`) actually resolves.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Until now the renderer emitted `data-builder-node-id` and
 * `data-builder-node-kind` on every node and NEVER a DOM `id`. Nothing in the
 * tree resolved a hash href, so no in-page anchor worked in any page design.
 * The visible cost: `restaurant-orderable`'s primary button says "Browse the
 * menu" and points at `#menu`, and clicking it does nothing. That design is
 * what the signup picker hands every restaurant-shaped tenant, so the first
 * thing a new restaurant sees on its own homepage is a dead primary button.
 *
 * `services.ts` documents the same constraint from the other side — it
 * deliberately uses NO in-page anchors and routes everything to `/book` or
 * `?inquiry=open`, with the note that "a silently inert button is worse than a
 * loudly broken one". This module is what lets a design stop working around it.
 *
 * WHY A BASE FIELD AND NOT A PER-KIND PROP
 * ────────────────────────────────────────
 * Any node can be an anchor target — a section, a container, a heading. Adding
 * `anchorId` to 47 per-kind prop schemas would be 47 chances to forget one.
 * `BuilderNodeBase` already carries exactly this shape of optional field
 * (`locked`, `lockedProps`, `visibilityCondition`, `i18n`, `experiment`,
 * `originRole`), all persisted through validate's BASE_NODE_FIELD_CARRIERS.
 * This is the seventh, and it inherits that machinery whole: props are the
 * source of truth, the base is a mirror, and both are re-derived on every
 * validate pass.
 *
 * SANITISATION IS NOT COSMETIC
 * ────────────────────────────
 * The value reaches the DOM as an `id` and is targeted by `href="#<value>"`,
 * so it must be a valid fragment with no characters that would need escaping
 * in a URL or a selector. An operator typing "Our Menu!" must get something
 * that works rather than something that half-works, so we slugify rather than
 * reject: lowercase, spaces and separators to `-`, drop everything outside
 * `[a-z0-9-]`, collapse and trim `-`. An empty or all-junk value normalizes to
 * `undefined`, which carries the field on NEITHER props nor base — a node with
 * no anchor is byte-identical to today.
 *
 * A leading digit is prefixed with `n-`: `document.querySelector("#2fast")`
 * throws, because a bare CSS identifier may not start with a digit. Getting an
 * exception instead of a null is the kind of failure that reads as "the whole
 * page is broken" rather than "that one anchor is wrong".
 *
 * KNOWN LIMIT, STATED RATHER THAN HIDDEN
 * ──────────────────────────────────────
 * Uniqueness is NOT enforced across a tree. Two nodes given the same anchorId
 * both render it, and the browser resolves the hash to the first in document
 * order — which is the standard behaviour for duplicate ids, not a crash. The
 * right place for a tree-wide dedupe is `validateBuilderNodeTree`, which is the
 * only pass that sees every node at once; it is deliberately not done here,
 * because a per-node normalizer cannot know about its siblings and pretending
 * otherwise would be the more dangerous half-measure.
 */

/** Max length of a normalized anchor. Long enough for a real section name. */
const MAX_ANCHOR_LENGTH = 64;

/**
 * Normalize an arbitrary operator-typed value into a DOM-safe fragment id, or
 * `undefined` when there is nothing usable. Pure; safe to call on any input.
 */
export function normalizeAnchorId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const slug = value
    .trim()
    .toLowerCase()
    // Separators an operator is likely to type, including the non-breaking
    // space a paste from a design tool leaves behind.
    .replace(/[\s_ ]+/g, "-")
    // Anything that is not an unreserved URL character has no business in a
    // fragment we are about to put in an href.
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ANCHOR_LENGTH)
    // The slice can leave a trailing separator behind.
    .replace(/-+$/g, "");

  if (!slug) return undefined;

  // A CSS identifier may not begin with a digit: `querySelector("#2fast")`
  // THROWS rather than returning null, so a numeric-leading anchor would break
  // any code scanning for the target instead of just failing to find it.
  return /^[0-9]/.test(slug) ? `n-${slug}` : slug;
}

/**
 * The `id` attribute to spread onto a rendered node, or an empty object when
 * the node has no anchor.
 *
 * Returning an object rather than `string | undefined` keeps the 47 render
 * sites to a single spread each, and means a node without an anchor emits NO
 * `id` attribute at all rather than `id={undefined}` — byte-identical output to
 * before this change for every existing tree.
 */
export function anchorIdAttrs(node: {
  anchorId?: string;
  props?: unknown;
}): { id?: string } {
  // Base mirror first (validate keeps it in sync), then props — which is the
  // source of truth and the only place a freshly-patched value exists before
  // the next validate pass.
  const fromBase = normalizeAnchorId(node.anchorId);
  if (fromBase) return { id: fromBase };

  const props =
    node.props && typeof node.props === "object" && !Array.isArray(node.props)
      ? (node.props as Record<string, unknown>)
      : undefined;
  const fromProps = normalizeAnchorId(props?.anchorId);
  return fromProps ? { id: fromProps } : {};
}
