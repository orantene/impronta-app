/**
 * GAP B — per-component-type default-style cascade.
 *
 * The real design-token cascade has three layers, resolved in this order
 * (highest wins):
 *
 *   1. per-element OVERRIDE  — the node's own `style` (literal or `token:` ref)
 *   2. per-component DEFAULT — `ComponentStyleDefaults[node.kind]` (this module)
 *   3. global TOKEN          — the theme token, reached via the existing
 *                              `var(--token-…, fallback)` chain in the renderer
 *
 * Layer 2 is what was missing: today a node with no explicit value inherits
 * nothing from the theme except raw DOM CSS inheritance. With this module, an
 * operator can say "all headings use Ink + the heading font by default" once,
 * and every heading starts there — while any single heading can still override
 * to red.
 *
 * ── The INHERIT sentinel ──────────────────────────────────────────────────
 * A node prop is normally either ABSENT (no opinion) or a concrete value (an
 * override). Both are needed, but the inspector also needs a THIRD, explicit
 * state so it can render "Inherit (Theme: Ink)" with a per-field override
 * toggle and let the operator *clear* an override back to inherit without the
 * field vanishing. That explicit state is the sentinel `@inherit`:
 *
 *   - ABSENT prop          → inherit (component default, else global token)
 *   - prop === "@inherit"  → inherit (SAME resolution — the sentinel is the
 *                            explicit, round-trippable form of "no override")
 *   - any other value      → override
 *
 * So the sentinel resolves identically to "absent" — it exists purely so the
 * authored tree can record "this field explicitly follows the cascade" and the
 * inspector can show/toggle it. Existing trees (absent props) are unaffected:
 * the cascade is purely additive.
 *
 * ── Resolution = a STYLE MERGE before the existing resolver ────────────────
 * The cascade is implemented as a merge applied to `node.props.style` at the
 * single central dispatch (`renderBuilderNode`), mirroring `applyStyleClass`.
 * The component default is the base; the node's own style wins; a node prop
 * equal to the sentinel is dropped so the default (or global) shows through.
 * The merged style then flows through the UNCHANGED `sharedNodeStyle` pipeline,
 * so `token:` refs in either layer resolve to `var()` exactly as before — the
 * editor canvas and the SSR renderer call the identical path. No fork.
 */
import { builderNodeStyleValueSchema } from "./registry";
import type { BuilderNode, BuilderNodeKind, BuilderNodeStyle } from "./types";

/** The explicit "follow the cascade" sentinel (distinct from absent / a value). */
export const STYLE_INHERIT_SENTINEL = "@inherit";

/** True when a style value is the explicit inherit sentinel. */
export function isInheritSentinel(value: unknown): boolean {
  return value === STYLE_INHERIT_SENTINEL;
}

/**
 * Per-component-type default styles. A partial builder-node style value per
 * node kind. Values are raw CSS strings/enums OR `token:<key>` bindings — the
 * same vocabulary a node's own style uses. Nested responsive/hover layers are
 * intentionally NOT part of component defaults in v1 (defaults are a base; the
 * node owns its responsive/hover behaviour).
 */
export type ComponentStyleDefaults = Partial<
  Record<BuilderNodeKind, BuilderNodeStyle>
>;

/**
 * Merge the component-type default for `node.kind` UNDER the node's own style.
 * Returns the node BY IDENTITY when there is no applicable default (so the
 * common case is byte-stable and allocation-free), mirroring `applyStyleClass`.
 *
 * Precedence inside the merged style:
 *   default field  <  node field            (node wins)
 *   node field === "@inherit"  →  dropped   (default, else global, shows)
 *
 * Nested keys (`responsive`, `containerQueries`, `hover`, `stateStyles`,
 * `classRef`, `customCss`) are taken from the node only — defaults never set
 * them in v1, and we never want a default to stomp a node's responsive rules.
 */
export function applyComponentStyleDefaults(
  node: BuilderNode,
  defaults: ComponentStyleDefaults | undefined,
): BuilderNode {
  if (!defaults || !("props" in node)) return node;
  const def = defaults[node.kind];
  if (!def || Object.keys(def).length === 0) return node;

  const nodeStyle = (node.props as { style?: BuilderNodeStyle }).style;

  // Base = the component default; overlay the node's own style on top, skipping
  // any field the node explicitly set to the inherit sentinel.
  const merged: Record<string, unknown> = { ...def };
  if (nodeStyle) {
    for (const [key, value] of Object.entries(nodeStyle)) {
      if (isInheritSentinel(value)) continue; // explicit inherit → default wins
      merged[key] = value;
    }
  }

  // Also honour the sentinel when the node DIDN'T set the field but we want the
  // default suppressed — not needed: absent simply lets the default through,
  // which is the intended behaviour.

  return {
    ...node,
    props: {
      ...(node.props as Record<string, unknown>),
      style: merged as BuilderNodeStyle,
    },
  } as BuilderNode;
}

// ── validation / normalization ────────────────────────────────────────────

/**
 * The closed set of node kinds, derived once. Kept local (a small literal) so
 * this module doesn't pull the heavy registry value graph at module load — the
 * list is the same discriminated union as `BuilderNodeKind`.
 */
const BUILDER_NODE_KINDS: ReadonlySet<string> = new Set<BuilderNodeKind>([
  "section",
  "container",
  "split",
  "accordion",
  "accordion_item",
  "tabs",
  "tab_panel",
  "carousel",
  "masonry",
  "heading",
  "paragraph",
  "button",
  "image",
  "video",
  "embed",
  "icon",
  "pricing_table",
  "rich_text",
  "code",
  "divider",
  "spacer",
  "card",
  "cta_group",
  "nav",
  "form",
  "section_embed",
]);

/**
 * Validate + normalize an untrusted stored component-styles map (from
 * `agency_branding.component_styles_json[_draft]`). Drops unknown node kinds
 * and validates each kind's value against the SAME style-value schema a node
 * uses (so a default can never carry a prop a node couldn't). Never throws —
 * returns the accepted subset (a malformed entry is dropped, not fatal), which
 * is the right posture for render-time reads. Use the `strict` form in the save
 * action when you want to surface rejects to the operator.
 */
export function normalizeComponentStyleDefaults(
  raw: unknown,
): ComponentStyleDefaults {
  const out: ComponentStyleDefaults = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!BUILDER_NODE_KINDS.has(kind)) continue;
    const parsed = builderNodeStyleValueSchema.safeParse(value);
    if (!parsed.success) continue;
    // Skip empties so `applyComponentStyleDefaults` can fast-path identity.
    if (Object.keys(parsed.data).length === 0) continue;
    out[kind as BuilderNodeKind] = parsed.data as BuilderNodeStyle;
  }
  return out;
}

/**
 * Strict validation for the save action: returns the accepted map plus the list
 * of rejected kinds + per-kind reasons, so the operator gets feedback instead
 * of a silent drop. Mirrors `validateThemePatch`'s shape.
 */
export function validateComponentStyleDefaults(raw: unknown):
  | { ok: true; normalized: ComponentStyleDefaults }
  | {
      ok: false;
      rejected: string[];
      reasons: Record<string, string>;
      normalized: ComponentStyleDefaults;
    } {
  const normalized: ComponentStyleDefaults = {};
  const rejected: string[] = [];
  const reasons: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!BUILDER_NODE_KINDS.has(kind)) {
        rejected.push(kind);
        reasons[kind] = "Unknown node kind";
        continue;
      }
      const parsed = builderNodeStyleValueSchema.safeParse(value);
      if (!parsed.success) {
        rejected.push(kind);
        reasons[kind] = parsed.error.issues[0]?.message ?? "Invalid style";
        continue;
      }
      if (Object.keys(parsed.data).length > 0) {
        normalized[kind as BuilderNodeKind] = parsed.data as BuilderNodeStyle;
      }
    }
  }
  if (rejected.length > 0) return { ok: false, rejected, reasons, normalized };
  return { ok: true, normalized };
}
