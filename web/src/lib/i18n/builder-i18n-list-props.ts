/**
 * Ticket #209 - localizable LIST items.
 *
 * `builder-i18n-props.ts` only holds flat string props. A few block kinds keep
 * visitor-facing copy inside an array prop (a spec table's rows, a magazine
 * masthead's contents index). Their overlay keys are DOTTED, the same shape
 * `nested-i18n.ts` and the marquee use:
 *
 *   props.i18n.es["rows.0.label"] = "Respuesta"
 *   props.i18n.es["contents.2.credit"] = "Tarifas y fechas"
 *
 * Pure data + two tiny helpers (no React, no IO) so the renderer helper, the
 * seed walker and the static test share one definition.
 */
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";

export interface LocalizableListSpec {
  /** The array prop on `node.props`. */
  readonly list: string;
  /** String fields of each item that carry visitor copy. */
  readonly fields: readonly string[];
}

export const LOCALIZABLE_LIST_PROPS_BY_KIND: Partial<
  Record<BuilderNodeKind, readonly LocalizableListSpec[]>
> = {
  spec_table: [{ list: "rows", fields: ["label", "value"] }],
  masthead: [{ list: "contents", fields: ["label", "credit"] }],
  // TUL-207: stats cells (`items.0.label`). `value` serves the spec variant,
  // whose value is typed text ("En 1 o 2 dias"); a count-up number has no
  // letters and never gets an overlay.
  stats: [{ list: "items", fields: ["label", "value", "caption", "prefix", "suffix"] }],
};

export function localizableListSpecsForKind(
  kind: BuilderNodeKind,
): readonly LocalizableListSpec[] {
  return LOCALIZABLE_LIST_PROPS_BY_KIND[kind] ?? [];
}

/** The dotted overlay key for one list item field, e.g. `rows.0.label`. */
export function listOverlayKey(list: string, index: number, field: string): string {
  return `${list}.${index}.${field}`;
}
