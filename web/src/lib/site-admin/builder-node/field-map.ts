/**
 * Wave 5B (job #37) — the VISUAL FIELD-MAPPER's resolution core.
 *
 * The inspector's field-mapper lets an operator connect a repeater's source
 * FIELDS to a child node's bindable PROPS (text / label / href / src / alt) and
 * shows a LIVE PREVIEW of the FIRST row's resolved values so the binding is
 * legible before publish. This module is the pure (no-IO, no-React) part: it
 * builds the {@link BuilderFieldMapPreview} the panel renders.
 *
 * It reuses the existing field-binding machinery verbatim
 * (`resolveBuilderFieldBindingValue` + the `BuilderRepeatItem` shape from
 * data-bindings.ts) so the preview resolves a prop EXACTLY as the renderer does
 * at runtime — there is no second, drifting binding system. The records come
 * from the same source the repeat path consumes (a collection's rows, or a
 * built-in source's records).
 */

import {
  getBuilderNodeFieldBindingProps,
  resolveBuilderFieldBindingValue,
  type BuilderDataSourceRecord,
  type BuilderFieldBindingProp,
  type BuilderRepeatItem,
} from "./data-bindings";
import type { BuilderNode, BuilderNodeKind } from "./types";

/** The manual prop value a node falls back to when a row field is empty. */
function nodeFallbackForProp(
  node: BuilderNode,
  prop: BuilderFieldBindingProp,
): string {
  const props = node.props as Record<string, unknown>;
  const raw = (() => {
    switch (prop) {
      case "text":
        return props.text;
      case "label":
        // buttons store their face as `label`; some nodes reuse `text`.
        return props.label ?? props.text;
      case "href":
        return props.href;
      case "src":
        return props.src;
      case "alt":
        return props.alt;
      default:
        return undefined;
    }
  })();
  return typeof raw === "string" ? raw : "";
}

/** A single mapped prop projected for the preview UI. */
export interface BuilderFieldMapPreviewRow {
  prop: BuilderFieldBindingProp;
  /** The source field key the prop is bound to (`fieldBindings[prop]`), or null. */
  boundField: string | null;
  /** The value resolved for the FIRST row (or the manual fallback). */
  resolvedValue: string;
  /** True when the value came from a bound field/token, not the manual fallback. */
  bound: boolean;
}

/** The full first-row preview for one node's field-map. */
export interface BuilderFieldMapPreview {
  /** Whether any data row was available to resolve against. */
  hasRow: boolean;
  rows: ReadonlyArray<BuilderFieldMapPreviewRow>;
}

/**
 * Coerce arbitrary persisted `fieldBindings` into a `prop → fieldKey` map,
 * restricted to the props the node kind supports. (The renderer reads the raw
 * prop, so this mirrors it without re-importing the normalizer.)
 */
export function readNodeFieldBindings(
  node: BuilderNode,
): Partial<Record<BuilderFieldBindingProp, string>> {
  const raw = (node.props as { fieldBindings?: unknown }).fieldBindings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = getBuilderNodeFieldBindingProps(node.kind);
  const out: Partial<Record<BuilderFieldBindingProp, string>> = {};
  for (const prop of allowed) {
    const value = (raw as Record<string, unknown>)[prop];
    if (typeof value === "string" && value.trim()) out[prop] = value.trim();
  }
  return out;
}

/** Build a {@link BuilderRepeatItem} for the FIRST record (or null when none). */
export function firstRepeatItemFromRecords(
  sourceKey: string,
  records: ReadonlyArray<BuilderDataSourceRecord> | null | undefined,
): BuilderRepeatItem | null {
  const record = records?.[0];
  if (!record) return null;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value == null) continue;
    if (typeof value === "string") {
      if (value) fields[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      fields[key] = String(value);
    } else if (Array.isArray(value)) {
      const joined = value
        .map((v) =>
          typeof v === "string" || typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : "",
        )
        .filter(Boolean)
        .join(", ");
      if (joined) fields[key] = joined;
    }
  }
  return { key: "preview-1", sourceKey, index: 0, fields, raw: record };
}

/**
 * Resolve a node's field-map against the first row. For every bindable prop the
 * node KIND supports we report the bound field (if any) and the value the
 * renderer would produce for the first row — using the very same
 * `resolveBuilderFieldBindingValue` path. When there is no row the rows still
 * list each prop (so the mapper shows every connectable prop), with the manual
 * fallback as the value and `hasRow: false`.
 */
export function buildBuilderFieldMapPreview(
  node: BuilderNode,
  firstItem: BuilderRepeatItem | null,
): BuilderFieldMapPreview {
  const props = getBuilderNodeFieldBindingProps(node.kind);
  const bindings = readNodeFieldBindings(node);
  const rows = props.map<BuilderFieldMapPreviewRow>((prop) => {
    const fallback = nodeFallbackForProp(node, prop);
    const boundField = bindings[prop] ?? null;
    const { value, bound } = resolveBuilderFieldBindingValue(
      fallback,
      boundField ?? undefined,
      firstItem,
    );
    return { prop, boundField, resolvedValue: value, bound };
  });
  return { hasRow: Boolean(firstItem), rows };
}

/** Node kinds that can field-map (have at least one bindable prop). */
export function nodeKindSupportsFieldMap(kind: BuilderNodeKind): boolean {
  return getBuilderNodeFieldBindingProps(kind).length > 0;
}
