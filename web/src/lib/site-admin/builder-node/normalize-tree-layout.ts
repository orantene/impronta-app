/**
 * normalize-tree-layout — the CONTENT-PRESERVING normalization gate every
 * draft save passes through ("a user can't break layouts and design and still
 * have flexibility").
 *
 * WHAT IT IS
 * ──────────
 * A pure canonicalizer: tree in → canonical tree out. It clamps absurd raw-CSS
 * escape values, folds the deterministic mobile repairs (mobile-fix.ts) into
 * the `responsive.mobile` bucket, and flattens wrapper chains past the nesting
 * depth cap — WITHOUT ever dropping a node or losing text / media / href
 * content. That is the load-bearing invariant: a normalizer that eats user
 * work is far worse than no normalizer, so every rule here either rewrites a
 * VALUE in place or splices a wrapper's children up a level. Nothing is
 * discarded except individual style values that cannot render at all
 * (NaN / negative lengths).
 *
 * WHERE IT RUNS
 * ─────────────
 * Server-side at every DRAFT save chokepoint (the same C1 chokepoints that
 * re-assert admin prop-locks): the homepage/page composition save, the cms
 * freeform page save, the agency site-shell save, the talent page save and the
 * talent site-shell save. It deliberately does NOT run at publish / AI ingest /
 * clipboard — those keep the STRICT `validateBuilderNodeTree` (schema-strip +
 * drop), which is correct there because the input is machine-generated or
 * already gated. A user's draft must never be strict-validated: strict
 * validation DROPS invalid content, and a draft is exactly where a user's
 * half-finished work lives.
 *
 * GUARANTEES (tested by property tests in normalize-tree-layout.test.ts)
 * ──────────
 *   1. Content preservation — every text / media src / href string present in
 *      the input survives in the output, byte-identical.
 *   2. Idempotence — normalize(normalize(t)) deep-equals normalize(t).
 *   3. Depth ≤ MAX_TREE_DEPTH for container chains (flattened, not dropped).
 *   4. A strictly-valid input tree stays strictly valid.
 *   5. Unknown / malformed shapes pass through untouched (this gate must never
 *      be the thing that corrupts a tree it doesn't understand).
 */

import { applyMobileFixes, collectMobileFixes } from "./mobile-fix";
import { validateBuilderNodeTree } from "./validate";
import { BUILDER_MAX_TREE_DEPTH } from "./tree-depth";
import type { BuilderNodeTree } from "./types";

// ── Clamp thresholds (each documented with its one-line rationale) ──────────

/**
 * Max font-size we let a raw `fontSize` escape freeze in px. The largest
 * shipped display tier resolves to clamp(3.5rem,6vw,6rem) ≈ 96px; 320px is 3×
 * beyond any professional display type yet still smaller than a phone
 * viewport, so a typo like "8000px" can no longer make one glyph the page.
 */
export const FONT_SIZE_MAX_PX = 320;

/**
 * Max fixed length for width / height / min-max clamps / flex-basis in px.
 * 4000px exceeds a full 4K viewport width (3840px) — no real element is a
 * fixed box wider than the widest screen it can be seen on, and the renderer's
 * min(v,100%) mobile clamp + the band overflow invariant contain the rest.
 */
export const FIXED_LENGTH_MAX_PX = 4000;

/**
 * Max per-side padding in px. Heroes legitimately run 200-300px of vertical
 * padding on large screens; 600px doubles that ceiling, while a mistyped
 * "4000px" padding no longer pushes the page's content a screen-height away.
 */
export const PADDING_MAX_PX = 600;

/**
 * Max free gap in px. The largest token gap is ~2rem; even editorial white
 * space tops out well under 400px between siblings, so anything past it is a
 * slipped keystroke, not a design.
 */
export const GAP_MAX_PX = 400;

/**
 * Max |margin| for the free per-side margin escapes in px (negatives are a
 * legitimate overlap technique, so sign is preserved). Overlap pulls are tens
 * of px; ±1000px is far beyond any deliberate overlap yet keeps the node
 * within one viewport-height of where the layout put it — still findable.
 */
export const FREE_MARGIN_MAX_PX = 1000;

/**
 * Max |translate| component in px. The canvas move handle already clamps a
 * drag so ≥40px of the block stays inside its parent; ±1000px keeps a stored
 * translate within roughly one viewport of the block's flow position so a
 * block can always be found and re-grabbed, while any parallax / overlap
 * design fits comfortably.
 */
export const TRANSLATE_MAX_PX = 1000;

/**
 * Max |translate| component in % (percentage translate resolves against the
 * NODE's own size, so this is the "relative to the parent/self" bound). ±300%
 * covers every off-canvas decorative trick (fully off-screen is 100%) with 3×
 * headroom; past it the node is unrecoverable by eye.
 */
export const TRANSLATE_MAX_PERCENT = 300;

/**
 * Max |z-index|. The editor chrome and shell overlays live in the low
 * thousands; ±9999 lets an author win any in-page stacking war without ever
 * out-stacking the editor's own UI.
 */
export const Z_INDEX_MAX = 9999;

/**
 * Max |inset| (top / right / bottom / left) in px. These are the OTHER half of
 * the positioning escapes — `position` itself is an enum the schema bounds, so
 * the insets are the only positioning values that can carry a typo. They matter
 * more now that `position: fixed` exists: a fixed node offset by a mistyped
 * "-99999px" is pinned OFF the viewport, with no scroll that can bring it back
 * and no in-flow box to grab, i.e. unrecoverable by eye. 4000px clears a 4K
 * viewport in either direction, so every deliberate off-screen / overlap trick
 * still fits. Negatives are preserved — pulling a node out of its box is a real
 * technique, so only the MAGNITUDE is bounded.
 */
export const INSET_MAX_PX = 4000;

/**
 * Nesting depth cap — the SHARED `BUILDER_MAX_TREE_DEPTH` (12), the same number
 * `validateBuilderNodeTree` defaults its `maxDepth` to, so this gate can never
 * leave behind a tree the strict publish validator would DROP a subtree from.
 * Deeper wrapper chains are flattened (children spliced up a level) — and,
 * unlike before, never silently: `normalizeBuilderTreeLayoutWithReport` reports
 * exactly which blocks were restructured and the editor tells the operator at
 * save time. See tree-depth.ts for why 12 and not 8.
 */
export const MAX_TREE_DEPTH = BUILDER_MAX_TREE_DEPTH;

// ── Small helpers ───────────────────────────────────────────────────────────

type Bag = Record<string, unknown>;

function isBag(value: unknown): value is Bag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse "123px" / "123" (unitless = px, the browser default) → px number. */
const PX_RE = /^(-?\d+(?:\.\d+)?)(px)?$/;

function parsePx(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = PX_RE.exec(value.trim());
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) ? n : null;
}

/**
 * Clamp one CSS length VALUE. Returns:
 *   - the input unchanged when it is relative / complex (%, rem, clamp(), var(),
 *     tokens…) — those are bounded by nature or belong to other validators;
 *   - `undefined` (= drop the key) when the value cannot render at all
 *     (non-string, NaN, or negative where negative is invalid CSS);
 *   - a clamped "<n>px" string when a parseable px magnitude exceeds the cap.
 */
function clampLength(
  value: unknown,
  opts: { maxPx: number; allowNegative?: boolean },
): unknown {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const px = parsePx(trimmed);
  if (px === null) {
    // "NaN" / "NaNpx" style garbage that would parse to a non-finite number.
    if (/^-?nan(px)?$/i.test(trimmed) || /^-?infinity(px)?$/i.test(trimmed)) {
      return undefined;
    }
    return value; // relative / complex — leave for the schema validators
  }
  if (!opts.allowNegative && px < 0) return undefined;
  const bound = opts.maxPx;
  if (px > bound) return `${bound}px`;
  if (opts.allowNegative && px < -bound) return `${-bound}px`;
  return value;
}

/**
 * Clamp a `translate` escape ("10px -8px", "50% 120%"). Each component is
 * clamped independently: px against ±TRANSLATE_MAX_PX, % against
 * ±TRANSLATE_MAX_PERCENT; any other unit passes through. A component that is
 * NaN/Infinity drops the whole value (it cannot render).
 */
function clampTranslate(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0 || parts.length > 3) return value;
  let changed = false;
  const out: string[] = [];
  for (const part of parts) {
    if (/^-?(nan|infinity)/i.test(part)) return undefined;
    const px = parsePx(part);
    if (px !== null) {
      if (px > TRANSLATE_MAX_PX) {
        out.push(`${TRANSLATE_MAX_PX}px`);
        changed = true;
        continue;
      }
      if (px < -TRANSLATE_MAX_PX) {
        out.push(`${-TRANSLATE_MAX_PX}px`);
        changed = true;
        continue;
      }
      out.push(part);
      continue;
    }
    const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(part);
    if (pct) {
      const n = Number.parseFloat(pct[1]!);
      if (!Number.isFinite(n)) return undefined;
      if (n > TRANSLATE_MAX_PERCENT) {
        out.push(`${TRANSLATE_MAX_PERCENT}%`);
        changed = true;
        continue;
      }
      if (n < -TRANSLATE_MAX_PERCENT) {
        out.push(`${-TRANSLATE_MAX_PERCENT}%`);
        changed = true;
        continue;
      }
      out.push(part);
      continue;
    }
    out.push(part); // rem/vw/calc component — leave it
  }
  return changed ? out.join(" ") : value;
}

// ── Style-bucket clamping ───────────────────────────────────────────────────

/** key → clamp rule for the raw-CSS length escapes. */
const LENGTH_CLAMPS: ReadonlyArray<{
  keys: readonly string[];
  maxPx: number;
  allowNegative?: boolean;
}> = [
  { keys: ["fontSize"], maxPx: FONT_SIZE_MAX_PX },
  {
    keys: [
      "width",
      "height",
      "minWidth",
      "minHeight",
      "maxWidthFree",
      "maxHeight",
      "flexBasis",
    ],
    maxPx: FIXED_LENGTH_MAX_PX,
  },
  {
    keys: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    maxPx: PADDING_MAX_PX,
  },
  { keys: ["gap"], maxPx: GAP_MAX_PX },
  // Positioning insets — bounded in magnitude, sign preserved (see INSET_MAX_PX).
  {
    keys: ["top", "right", "bottom", "left"],
    maxPx: INSET_MAX_PX,
    allowNegative: true,
  },
  {
    keys: [
      "marginTopFree",
      "marginRightFree",
      "marginBottomFree",
      "marginLeftFree",
    ],
    maxPx: FREE_MARGIN_MAX_PX,
    allowNegative: true,
  },
];

/**
 * Clamp ONE style bucket (the base style or a responsive / container-query
 * layer). Copy-on-write: returns the input reference when nothing changed.
 * Only values it can PROVE are broken or absurd are touched; every other key
 * passes through byte-identical.
 */
function clampStyleBucket(bucket: unknown): unknown {
  if (!isBag(bucket)) return bucket;
  let next: Bag | null = null;
  const set = (key: string, value: unknown) => {
    if (next === null) next = { ...(bucket as Bag) };
    if (value === undefined) delete next[key];
    else next[key] = value;
  };

  for (const rule of LENGTH_CLAMPS) {
    for (const key of rule.keys) {
      const raw = bucket[key];
      if (raw === undefined) continue;
      const clamped = clampLength(raw, {
        maxPx: rule.maxPx,
        allowNegative: rule.allowNegative,
      });
      if (clamped !== raw) set(key, clamped);
    }
  }

  if (bucket.translate !== undefined) {
    const clamped = clampTranslate(bucket.translate);
    if (clamped !== bucket.translate) set("translate", clamped);
  }

  // Numeric escapes: opacity ∈ [0,1]; |zIndex| ≤ cap; lineClamp ≥ 0.
  const opacity = bucket.opacity;
  if (opacity !== undefined && typeof opacity === "number") {
    if (!Number.isFinite(opacity)) set("opacity", undefined);
    else if (opacity < 0) set("opacity", 0);
    else if (opacity > 1) set("opacity", 1);
  }
  const zIndex = bucket.zIndex;
  if (zIndex !== undefined && typeof zIndex === "number") {
    if (!Number.isFinite(zIndex)) set("zIndex", undefined);
    else if (zIndex > Z_INDEX_MAX) set("zIndex", Z_INDEX_MAX);
    else if (zIndex < -Z_INDEX_MAX) set("zIndex", -Z_INDEX_MAX);
  }
  const lineClamp = bucket.lineClamp;
  if (lineClamp !== undefined && typeof lineClamp === "number") {
    if (!Number.isFinite(lineClamp) || lineClamp < 0) set("lineClamp", undefined);
  }

  return next ?? bucket;
}

/** Clamp a full node `style` object: base + responsive + containerQueries + hover. */
function clampNodeStyle(style: unknown): unknown {
  if (!isBag(style)) return style;
  let next = clampStyleBucket(style) as Bag;

  const clampLayerMap = (mapKey: "responsive" | "containerQueries") => {
    const map = next[mapKey];
    if (!isBag(map)) return;
    let nextMap: Bag | null = null;
    for (const [bucketName, bucket] of Object.entries(map)) {
      const clamped = clampStyleBucket(bucket);
      if (clamped !== bucket) {
        if (nextMap === null) nextMap = { ...map };
        nextMap[bucketName] = clamped;
      }
    }
    if (nextMap !== null) {
      if (next === style) next = { ...style };
      next[mapKey] = nextMap;
    }
  };
  clampLayerMap("responsive");
  clampLayerMap("containerQueries");

  // Hover / state layers carry translate + opacity from the same escape family.
  if (isBag(next.hover)) {
    const clamped = clampStyleBucket(next.hover);
    if (clamped !== next.hover) {
      if (next === style) next = { ...style };
      next.hover = clamped;
    }
  }
  if (isBag(next.stateStyles)) {
    let states = next.stateStyles as Bag;
    let statesChanged = false;
    for (const stateKey of ["focus", "active"]) {
      const layer = states[stateKey];
      const clamped = clampStyleBucket(layer);
      if (clamped !== layer) {
        if (!statesChanged) {
          states = { ...states };
          statesChanged = true;
        }
        states[stateKey] = clamped;
      }
    }
    if (statesChanged) {
      if (next === style) next = { ...style };
      next.stateStyles = states;
    }
  }

  return next;
}

// ── Pass 1: value clamping (recursive, copy-on-write, shape-tolerant) ───────

function clampNode(node: unknown): unknown {
  if (!isBag(node)) return node;
  let next: Bag | null = null;
  const props = node.props;
  if (isBag(props) && props.style !== undefined) {
    const clampedStyle = clampNodeStyle(props.style);
    if (clampedStyle !== props.style) {
      next = { ...node, props: { ...props, style: clampedStyle } };
    }
  }
  const children = node.children;
  if (Array.isArray(children)) {
    let nextChildren: unknown[] | null = null;
    children.forEach((child, index) => {
      const clamped = clampNode(child);
      if (clamped !== child) {
        if (nextChildren === null) nextChildren = [...children];
        nextChildren[index] = clamped;
      }
    });
    if (nextChildren !== null) {
      next = next ? { ...next, children: nextChildren } : { ...node, children: nextChildren };
    }
  }
  return next ?? node;
}

// ── Pass 2: depth cap by wrapper flattening ─────────────────────────────────

/** Height of a node's subtree (a leaf is 1). Tolerant of malformed shapes. */
function subtreeHeight(node: unknown): number {
  if (!isBag(node)) return 1;
  const children = node.children;
  if (!Array.isArray(children) || children.length === 0) return 1;
  let max = 0;
  for (const child of children) {
    const h = subtreeHeight(child);
    if (h > max) max = h;
  }
  return 1 + max;
}

/**
 * May `node`'s children be spliced directly into a parent of `parentKind`?
 * Only a `container` is a pass-through wrapper, and only under a parent whose
 * child allow-list is a superset of the container's own (section / container
 * share COMPOSABLE_LAYOUT_CHILD_KINDS) — so a splice can never create a
 * parent/child pairing the strict validator would reject. Structural wrappers
 * (accordion, tabs, split…) are never flattened: their children are
 * meaningful slots, not generic content.
 */
function canSpliceInto(parentKind: string | null, node: Bag): boolean {
  return (
    node.kind === "container" &&
    (parentKind === "container" || parentKind === "section")
  );
}

// ── Flatten REPORT (the operator has to be told) ────────────────────────────

/**
 * One wrapper the depth cap had to splice away. The whole point of this record
 * is that a restructure can be NAMED back to the operator ("the wrapper inside
 * Pricing"), because a save that silently rewrites structure is, from where the
 * operator sits, data corruption — not a guardrail.
 */
export interface BuilderTreeFlattenNotice {
  /** Node id of the spliced wrapper (null on a malformed node with no id). */
  nodeId: string | null;
  /** Node kind, always `container` today (only containers are splice-able). */
  nodeKind: string;
  /** Operator-facing name of the wrapper itself. */
  label: string;
  /** Operator-facing name of the nearest ancestor section, when there is one. */
  sectionLabel: string | null;
}

/** Trim + collapse a candidate label; "" when there is nothing usable. */
function cleanLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length === 0) return "";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/**
 * First heading / text string within `depth` levels of `node`, so a generic
 * wrapper can borrow the name the operator actually recognises. Deliberately
 * shape-tolerant and dependency-free: this module is the shape-TOLERANT gate and
 * must not start importing the registry / layer-name resolver (which assume a
 * strictly-valid node) just to build a toast string.
 */
function borrowedText(node: Bag, depth: number): string {
  const props = isBag(node.props) ? node.props : null;
  if (props) {
    const own =
      cleanLabel(props.name) || cleanLabel(props.label) || cleanLabel(props.title);
    if (own) return own;
    if (node.kind === "heading" || node.kind === "text" || node.kind === "rich_text") {
      const text = cleanLabel(props.text);
      if (text) return text;
    }
  }
  if (depth <= 0) return "";
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (!isBag(child)) continue;
    const found = borrowedText(child, depth - 1);
    if (found) return found;
  }
  return "";
}

/** Operator-facing name for a node in a flatten notice. */
function noticeLabel(node: Bag): string {
  const borrowed = borrowedText(node, 2);
  if (borrowed) return borrowed;
  const kind = typeof node.kind === "string" ? node.kind : "block";
  const layout = isBag(node.props) ? cleanLabel(node.props.layout) : "";
  const base = kind.replace(/_/g, " ");
  return layout ? `${base} (${layout})` : base;
}

/**
 * Cap the height of every subtree in `list` to `budget` levels by flattening
 * pass-through container wrappers (splicing their children up one level).
 * Content is NEVER discarded: when no flattenable wrapper exists on an
 * over-deep path (a pathological structural chain), the subtree is left
 * as-is rather than truncated. Copy-on-write.
 *
 * Every splice is appended to `report` so the caller can tell the operator what
 * changed and where. Recording is free when nothing is flattened (the common
 * case), and the report never affects the OUTPUT tree — the two lanes cannot
 * drift, because the report is written from inside the one splice branch.
 */
function capList(
  parentKind: string | null,
  list: unknown[],
  budget: number,
  ctx: { report: BuilderTreeFlattenNotice[]; sectionLabel: string | null },
): unknown[] {
  const out: unknown[] = [];
  let changed = false;

  for (const item of list) {
    if (isBag(item) && subtreeHeight(item) > budget && canSpliceInto(parentKind, item)) {
      // Flatten: the wrapper's children take its place at the SAME budget.
      ctx.report.push({
        nodeId: typeof item.id === "string" ? item.id : null,
        nodeKind: typeof item.kind === "string" ? item.kind : "container",
        label: noticeLabel(item),
        sectionLabel: ctx.sectionLabel,
      });
      const children = Array.isArray(item.children) ? item.children : [];
      out.push(...capList(parentKind, children, budget, ctx));
      changed = true;
      continue;
    }
    if (isBag(item) && Array.isArray(item.children) && item.children.length > 0) {
      const kind = typeof item.kind === "string" ? item.kind : null;
      const cappedChildren = capList(kind, item.children, budget - 1, {
        report: ctx.report,
        // A section renames the context for everything beneath it, so a notice
        // reads "inside Pricing" rather than "inside the page".
        sectionLabel: kind === "section" ? noticeLabel(item) : ctx.sectionLabel,
      });
      if (cappedChildren !== item.children) {
        out.push({ ...item, children: cappedChildren });
        changed = true;
        continue;
      }
    }
    out.push(item);
  }

  return changed ? out : list;
}

// ── Public gate ─────────────────────────────────────────────────────────────

/**
 * Shape-tolerant entry: accepts the `unknown` blocks value the jsonb-backed
 * adapters carry. Anything that is not an array passes through untouched —
 * this gate normalizes trees it understands and must never be the thing that
 * mangles a value it doesn't.
 */
export function normalizeUnknownBuilderTreeLayout(tree: unknown): unknown {
  return normalizeUnknownBuilderTreeLayoutWithReport(tree).tree;
}

/**
 * The same gate, plus the RESTRUCTURE REPORT.
 *
 * `flattened` lists every wrapper the depth cap spliced away, newest-outermost
 * first, each named well enough to find on the canvas. It is empty on the
 * overwhelmingly common path (nothing was restructured), and non-empty is the
 * signal the caller MUST NOT swallow: the operator's structure changed, and
 * `collectBuilderTreeFlattenNotices` lets the editor say so at save time,
 * before the write, naming the block.
 */
export function normalizeUnknownBuilderTreeLayoutWithReport(tree: unknown): {
  tree: unknown;
  flattened: BuilderTreeFlattenNotice[];
} {
  const flattened: BuilderTreeFlattenNotice[] = [];
  if (!Array.isArray(tree)) return { tree, flattened };

  // Pass 1 — clamp absurd / unrenderable raw-CSS escape values in place.
  let current: unknown[] = tree;
  let clamped: unknown[] | null = null;
  current.forEach((node, index) => {
    const c = clampNode(node);
    if (c !== node) {
      if (clamped === null) clamped = [...current];
      clamped[index] = c;
    }
  });
  if (clamped !== null) current = clamped;

  // Pass 2 — flatten wrapper chains past the depth cap (roots sit at depth 1).
  current = capList(null, current, MAX_TREE_DEPTH, {
    report: flattened,
    sectionLabel: null,
  });

  // Pass 3 — fold the deterministic mobile repairs into `responsive.mobile`.
  // GUARDED on strict validity: `applyMobileFixes` routes through
  // `applyBuilderNodeOperation`, whose heal path returns the REPAIRED tree
  // (pre-existing corrupt nodes dropped) when the input already has issues.
  // On a corrupt draft that would violate content preservation, so the mobile
  // stage only runs when the tree is already strictly valid — a corrupt draft
  // still gets its clamps + depth cap and keeps every byte of content.
  const validity = validateBuilderNodeTree(current);
  if (validity.ok) {
    const typed = current as unknown as BuilderNodeTree;
    const fixes = collectMobileFixes(typed);
    if (fixes.length > 0) {
      const fixed = applyMobileFixes(typed, fixes);
      if (fixed.ok && fixed.appliedCount > 0) {
        current = fixed.tree as unknown as unknown[];
      }
    }
  }

  return { tree: current, flattened };
}

/**
 * Typed entry for the composition/talent save paths that already carry a
 * `BuilderNodeTree`. Same behavior as the unknown-shaped gate.
 */
export function normalizeBuilderTreeLayout(tree: BuilderNodeTree): BuilderNodeTree {
  return normalizeUnknownBuilderTreeLayout(tree) as BuilderNodeTree;
}

/**
 * Typed entry that also returns the restructure report — the server-side twin
 * of the editor's pre-save check.
 */
export function normalizeBuilderTreeLayoutWithReport(tree: BuilderNodeTree): {
  tree: BuilderNodeTree;
  flattened: BuilderTreeFlattenNotice[];
} {
  const result = normalizeUnknownBuilderTreeLayoutWithReport(tree);
  return { tree: result.tree as BuilderNodeTree, flattened: result.flattened };
}

/**
 * WOULD this tree be restructured by the depth cap? Returns the same notices
 * `normalize…WithReport` produces, without keeping the normalized tree.
 *
 * This is the EDITOR's hook, and it is deliberately the same code path as the
 * server's: the editor calls it on the exact tree it is about to send, so the
 * warning it shows cannot drift from what the save actually does (a second,
 * re-implemented "would this flatten?" heuristic in the client is precisely how
 * a warning goes stale and starts lying). Pure, cheap, no I/O — it runs the
 * depth pass only, which is a single subtree-height walk.
 */
export function collectBuilderTreeFlattenNotices(
  tree: unknown,
): BuilderTreeFlattenNotice[] {
  if (!Array.isArray(tree)) return [];
  const report: BuilderTreeFlattenNotice[] = [];
  capList(null, tree, MAX_TREE_DEPTH, { report, sectionLabel: null });
  return report;
}
