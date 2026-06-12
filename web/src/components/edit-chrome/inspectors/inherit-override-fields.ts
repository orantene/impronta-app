/**
 * #3b — per-node Inherit / Override resolution (PURE logic, no React).
 *
 * Figma/Webflow-style: for a style field that has a theme/component default,
 * the inspector shows the RESOLVED source ("Inherit · Theme: Ink") plus a
 * per-field toggle between:
 *
 *   - INHERIT   the node carries no literal for the field → the cascade default
 *               (component default, else the global theme token) shows through.
 *               In the authored tree this is either an ABSENT prop or the
 *               explicit `@inherit` sentinel — both resolve identically.
 *   - OVERRIDE  the node carries its own literal / token-ref for the field.
 *
 * The cascade itself is already functional (set a field = override, clear =
 * inherit — see `applyComponentStyleDefaults`). This module is the UI's
 * source-of-truth for WHICH fields are cascade-relevant per node kind, what
 * their current state is, and what literal to SEED when the operator flips a
 * field from inherit → override (so the override starts from the value they were
 * already seeing, not a blank).
 *
 * It is deliberately free of React + the heavy registry value-graph so it can be
 * unit-tested directly (`inherit-override-fields.test.ts`).
 */
import {
  STYLE_INHERIT_SENTINEL,
  isInheritSentinel,
  type ComponentStyleDefaults,
} from "@/lib/site-admin/builder-node/component-style-defaults";
import {
  STYLE_BINDABLE_COLOR_TOKENS,
  STYLE_BINDABLE_FONT_FAMILY_TOKENS,
  STYLE_BINDABLE_FONT_SIZE_TOKENS,
  STYLE_BINDABLE_RADIUS_TOKENS,
  STYLE_BINDABLE_SHADOW_TOKENS,
  parseStyleTokenRef,
  type StyleBindableToken,
} from "@/lib/site-admin/builder-node/style-token-bindings";
import type {
  BuilderNodeKind,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node/types";

/** A style field the cascade can drive (token-aware in the registry schema). */
export type InheritableStyleField =
  | "textColor"
  | "backgroundColor"
  | "borderColor"
  | "fontFamily"
  | "fontSize"
  | "borderRadius"
  | "boxShadow";

interface InheritFieldDef {
  field: InheritableStyleField;
  label: string;
  /** The bindable-token catalog whose first entry is the "Theme: …" default. */
  tokens: ReadonlyArray<StyleBindableToken>;
}

// Field catalog — label + the token family each field inherits from. Order is
// the order they render in the inspector panel.
const FIELD_DEFS: ReadonlyArray<InheritFieldDef> = [
  { field: "textColor", label: "Text color", tokens: STYLE_BINDABLE_COLOR_TOKENS },
  { field: "backgroundColor", label: "Fill", tokens: STYLE_BINDABLE_COLOR_TOKENS },
  { field: "borderColor", label: "Border color", tokens: STYLE_BINDABLE_COLOR_TOKENS },
  { field: "fontFamily", label: "Font", tokens: STYLE_BINDABLE_FONT_FAMILY_TOKENS },
  { field: "fontSize", label: "Text size", tokens: STYLE_BINDABLE_FONT_SIZE_TOKENS },
  { field: "borderRadius", label: "Corner radius", tokens: STYLE_BINDABLE_RADIUS_TOKENS },
  { field: "boxShadow", label: "Shadow", tokens: STYLE_BINDABLE_SHADOW_TOKENS },
];

const FIELD_DEF_BY_FIELD: ReadonlyMap<InheritableStyleField, InheritFieldDef> =
  new Map(FIELD_DEFS.map((d) => [d.field, d]));

/**
 * Which cascade-relevant fields the inspector surfaces per node kind. Mirrors
 * the field groupings already rendered in the Style panel (heading/paragraph
 * own text + font; container/card/etc own fill/border/radius/shadow). A kind not
 * listed here surfaces no inherit panel (e.g. spacer/divider have no themable
 * surface). Conservative on purpose — we'd rather omit a field than dangle a
 * toggle that does nothing visible.
 */
export const INHERIT_FIELDS_BY_KIND: Partial<
  Record<BuilderNodeKind, ReadonlyArray<InheritableStyleField>>
> = {
  heading: ["textColor", "fontFamily", "fontSize"],
  paragraph: ["textColor", "fontFamily", "fontSize"],
  rich_text: ["textColor", "fontFamily", "fontSize"],
  button: ["textColor", "backgroundColor", "borderColor", "fontFamily", "borderRadius", "boxShadow"],
  card: ["backgroundColor", "borderColor", "borderRadius", "boxShadow"],
  container: ["backgroundColor", "borderColor", "borderRadius", "boxShadow"],
  split: ["backgroundColor", "borderColor", "borderRadius", "boxShadow"],
  cta_group: ["backgroundColor", "borderColor", "borderRadius", "boxShadow"],
  image: ["borderColor", "borderRadius", "boxShadow"],
};

export type FieldInheritState = "inherit" | "override";

export interface FieldInheritRow {
  field: InheritableStyleField;
  label: string;
  state: FieldInheritState;
  /**
   * Human label for the resolved cascade source shown next to "Inherit":
   *   - a component default bound to a token  → that token's label ("Theme: Ink")
   *   - a component default with a raw literal → "Default"
   *   - no component default, falls to a token → the field's primary token label
   *   - nothing resolvable                     → "Theme default"
   */
  source: string;
  /**
   * Literal to SEED into the node when the operator flips inherit → override, so
   * the override starts from what they were already seeing. Prefer the component
   * default's value (token-ref or literal); else the primary token-ref for the
   * field; else "" (operator types a fresh value).
   */
  seedValue: string;
  /** True when the node's stored value is the explicit `@inherit` sentinel. */
  isSentinel: boolean;
}

/**
 * True when a stored style value means "inherit" (absent OR the `@inherit`
 * sentinel). Any other value is an override.
 */
export function isInheritingValue(value: unknown): boolean {
  return value === undefined || value === null || isInheritSentinel(value);
}

/** Friendly source label + seed for a field given the resolved kind default. */
function resolveSourceAndSeed(
  def: InheritFieldDef,
  componentDefaultValue: string | undefined,
): { source: string; seed: string } {
  // 1. A component-type default exists for this field.
  if (componentDefaultValue !== undefined && componentDefaultValue !== "") {
    const token = parseStyleTokenRef(componentDefaultValue);
    if (token) return { source: `Theme: ${token.label}`, seed: componentDefaultValue };
    // Raw literal default (e.g. "#111111") — seed it verbatim.
    return { source: "Default", seed: componentDefaultValue };
  }
  // 2. No component default → fall to the field's primary theme token.
  const primary = def.tokens[0];
  if (primary) {
    return { source: `Theme: ${primary.label}`, seed: `token:${primary.key}` };
  }
  // 3. Nothing resolvable — operator types a fresh value on override.
  return { source: "Theme default", seed: "" };
}

/**
 * Build the inherit/override rows for a selected node. PURE — feed it the node's
 * base style value (NOT a responsive layer) + the resolved component-default map
 * for the kind. Returns an empty array for a kind with no themable surface.
 *
 * @param kind     the selected node's kind
 * @param style    the node's BASE style value (node.props.style, desktop layer)
 * @param defaults the resolved component-defaults map (draft preview, else live)
 */
export function buildFieldInheritRows(
  kind: BuilderNodeKind,
  style: BuilderNodeStyleValue | undefined,
  defaults: ComponentStyleDefaults | null | undefined,
): ReadonlyArray<FieldInheritRow> {
  const fields = INHERIT_FIELDS_BY_KIND[kind];
  if (!fields || fields.length === 0) return [];
  const kindDefaults = defaults?.[kind];
  const rows: FieldInheritRow[] = [];
  for (const field of fields) {
    const def = FIELD_DEF_BY_FIELD.get(field);
    if (!def) continue;
    const stored = style?.[field] as string | undefined;
    const inheriting = isInheritingValue(stored);
    const componentDefaultValue = kindDefaults?.[field] as string | undefined;
    const { source, seed } = resolveSourceAndSeed(def, componentDefaultValue);
    rows.push({
      field,
      label: def.label,
      state: inheriting ? "inherit" : "override",
      source,
      seedValue: seed,
      isSentinel: isInheritSentinel(stored),
    });
  }
  return rows;
}

export { STYLE_INHERIT_SENTINEL };
