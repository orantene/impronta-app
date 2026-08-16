/**
 * quick-style-logic.ts — pure decisions for the selection-toolbar quick-style
 * popover (backlog item 1, 2026-08-15).
 *
 * The popover surfaces the 3-4 properties operators actually touch (fill,
 * padding, corner radius, shadow) directly on the anchored selection toolbar,
 * so a background change costs 3 interactions instead of the audited 5-6
 * (select → Design → expand Appearance → swatch → pick → dismiss).
 *
 * DELIBERATELY NO WRITE PATH HERE. Every commit goes through the existing
 * `patchSelectedBuilderNodesStyle` chokepoint (edit-context →
 * `mergeStylePatchIntoTree`), which already handles undo/CAS, per-node INS-1
 * lock stripping, multi-node fan-out, and the responsive bucket. This module
 * only answers the pure questions:
 *   - which quick fields apply to which node kind (mirrors the inspector's
 *     per-kind gating so the popover never offers a control the Style tab
 *     would not),
 *   - which responsive bucket the active canvas device edits (mirrors the
 *     style panel's wide→desktop / compact→mobile mapping, so a padding edit
 *     on mobile preview lands in the mobile bucket — never the base),
 *   - what the current (possibly Mixed) value of each field is, resolved via
 *     the same `resolveMultiSelectionField` the multi-select inspector uses,
 *   - what style patch a control commit should emit.
 *
 * Pure + client-safe (no React, no DOM) so the unit test imports it directly.
 */

import {
  MIXED,
  resolveMultiSelectionField,
  type MultiSelectionBucket,
  type MultiSelectionStyleNode,
} from "@/lib/site-admin/builder-node/multi-selection-style";

export type QuickStyleField = "fill" | "padding" | "radius" | "shadow";

/**
 * Per-kind applicability — a strict mirror of the inspector's gates:
 *   fill    → AppearanceSection's `backgroundColor` swatch kinds
 *   padding → SpacingSection's paddingX/paddingY preset kinds
 *   radius  → AppearanceSection's "Corners" segmented kinds
 *   shadow  → surface kinds + image (EffectsSurfaceSection's boxShadow reach)
 *
 * `button` is listed for completeness (bulk selections can contain buttons);
 * a lone button never sees the popover because its selection uses the canvas
 * text toolbar, whose typography/color controls already cover it.
 */
const FILL_KINDS: ReadonlySet<string> = new Set([
  "container",
  "split",
  "card",
  "cta_group",
  "button",
]);
const PADDING_KINDS: ReadonlySet<string> = FILL_KINDS;
const RADIUS_KINDS: ReadonlySet<string> = new Set([...FILL_KINDS, "image"]);
const SHADOW_KINDS: ReadonlySet<string> = RADIUS_KINDS;

/** Priority order (audit order): fill, padding, radius, shadow. */
const FIELD_ORDER: ReadonlyArray<{
  field: QuickStyleField;
  kinds: ReadonlySet<string>;
}> = [
  { field: "fill", kinds: FILL_KINDS },
  { field: "padding", kinds: PADDING_KINDS },
  { field: "radius", kinds: RADIUS_KINDS },
  { field: "shadow", kinds: SHADOW_KINDS },
];

/** The quick fields applicable to ONE node kind, in priority order. */
export function quickStyleFieldsForKind(kind: string): QuickStyleField[] {
  return FIELD_ORDER.filter((f) => f.kinds.has(kind)).map((f) => f.field);
}

/**
 * The quick fields for a (possibly multi-node) selection: the UNION of each
 * kind's fields, so a mixed container+image selection offers radius/shadow
 * while a pure-image selection never offers a dead Fill control. An empty
 * result means the popover trigger should not render at all (no dead buttons).
 */
export function quickStyleFieldsForSelection(
  kinds: ReadonlyArray<string>,
): QuickStyleField[] {
  return FIELD_ORDER.filter((f) => kinds.some((k) => f.kinds.has(k))).map(
    (f) => f.field,
  );
}

/**
 * Which responsive bucket the active canvas device edits. Mirrors the style
 * panel's mapping exactly (style-panel.tsx `mappedViewport`): the custom tiers
 * map wide→desktop(base) and compact→mobile, so a quick edit lands in the same
 * bucket the inspector would write for the same canvas device.
 */
export function quickStyleBucketForDevice(device: string): MultiSelectionBucket {
  if (device === "tablet") return "tablet";
  if (device === "mobile" || device === "compact") return "mobile";
  return null; // desktop + wide → base style
}

/** One field's resolved UI state across the selection. */
export interface QuickStyleFieldState {
  /**
   * The shared value ("" when every node leaves the field unset), or `null`
   * when the nodes disagree / the axes disagree (render as Mixed/no-selection).
   */
  value: string | null;
  /** True when the selection disagrees on the field. */
  mixed: boolean;
  /** True when AT LEAST ONE selected node locks the field (control disables). */
  locked: boolean;
}

export interface QuickStyleState {
  fill: QuickStyleFieldState;
  padding: QuickStyleFieldState;
  radius: QuickStyleFieldState;
  shadow: QuickStyleFieldState;
}

function toStringValue(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function resolveScalar(
  nodes: ReadonlyArray<MultiSelectionStyleNode>,
  field: string,
  bucket: MultiSelectionBucket,
): QuickStyleFieldState {
  const r = resolveMultiSelectionField(nodes, field, bucket);
  if (r.value === MIXED) return { value: null, mixed: true, locked: r.locked };
  return { value: toStringValue(r.value), mixed: false, locked: r.locked };
}

/** The padding presets the quick control offers (paddingX has no "xl"). */
export const QUICK_PADDING_PRESETS = ["none", "s", "m", "l"] as const;

/**
 * Resolve the current values for every quick field in the given bucket.
 *
 * Padding is a COMPOSITE: the quick control writes one preset to BOTH
 * `paddingX` and `paddingY`, so its read-side only reports a preset when both
 * axes agree on one of the quick presets. Axes that disagree (or a `paddingY`
 * of "xl", which `paddingX` cannot mirror) resolve to `null` — the segmented
 * renders with no active chip rather than lying about one axis.
 */
export function resolveQuickStyleState(
  nodes: ReadonlyArray<MultiSelectionStyleNode>,
  bucket: MultiSelectionBucket,
): QuickStyleState {
  const fill = resolveScalar(nodes, "backgroundColor", bucket);
  const radius = resolveScalar(nodes, "radius", bucket);
  const shadow = resolveScalar(nodes, "boxShadow", bucket);

  const px = resolveScalar(nodes, "paddingX", bucket);
  const py = resolveScalar(nodes, "paddingY", bucket);
  const locked = px.locked || py.locked;
  const mixed = px.mixed || py.mixed;
  let value: string | null = null;
  if (!mixed && px.value !== null && py.value !== null) {
    if (px.value === "" && py.value === "") {
      value = "";
    } else if (
      px.value === py.value &&
      (QUICK_PADDING_PRESETS as ReadonlyArray<string>).includes(px.value)
    ) {
      value = px.value;
    }
    // else: axes disagree or hold a non-quick value → null (custom).
  }
  return { fill, radius, shadow, padding: { value, mixed, locked } };
}

/**
 * Build the style patch a control commit emits. `""` (and re-clicking the
 * active chip, which callers normalize to `""`) CLEARS the field — matching
 * the inspector's `setOrToggleStandaloneStyle` toggle-off semantics. The
 * patch's `undefined` values delete the key via `mergeStylePatchIntoTree`'s
 * apply semantics, in the base style or the bucket the caller passes along.
 */
export function buildQuickStylePatch(
  field: QuickStyleField,
  value: string,
): Record<string, unknown> {
  const v = value === "" ? undefined : value;
  switch (field) {
    case "fill":
      return { backgroundColor: v };
    case "padding":
      return { paddingX: v, paddingY: v };
    case "radius":
      return { radius: v };
    case "shadow":
      return { boxShadow: v };
  }
}
