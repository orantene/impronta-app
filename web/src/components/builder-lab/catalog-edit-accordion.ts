/**
 * O9 — multi-row edit accordion: pure logic for the Catalog's "several rows'
 * override editors open at once" model.
 *
 * The Catalog used to track a single open editor with `editingId: string | null`
 * (one accordion at a time). O9 swaps that for a `Set<string>` of expanded ids
 * plus per-row form state keyed by id, so an admin can compare/tune the
 * locked-props + default-props of several components side-by-side. The set
 * arithmetic + per-row form-state shape live here (framework-free) so they're
 * unit-testable without a DOM.
 */

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";

/** The per-row override-edit form values. One snapshot per expanded row, keyed
 *  by the row id in {@link EditFormMap}. Mirrors the fields the EditAccordionRow
 *  renders (Display + Governance groups). */
export interface EditFormState {
  label: string;
  category: string;
  icon: string;
  plan: string;
  lockedProps: string;
  defaultVariant: string;
  defaultProps: string;
  defaultPropsError: string | null;
  dataSourceDefaults: string;
  dataSourceDefaultsError: string | null;
}

/** id → form snapshot. Independent so two open rows never share input values. */
export type EditFormMap = Record<string, EditFormState>;

/** A pristine (all-default) form snapshot — used as the base before seeding from
 *  an item's overlay. */
export function emptyEditForm(): EditFormState {
  return {
    label: "",
    category: "",
    icon: "",
    plan: "",
    lockedProps: "",
    defaultVariant: "",
    defaultProps: "",
    defaultPropsError: null,
    dataSourceDefaults: "",
    dataSourceDefaultsError: null,
  };
}

/** Seed a form snapshot from a catalog row's current overlay (the values the
 *  inline editor opens with). Blank where no override is set. */
export function editFormFromItem(item: CatalogAdminItem): EditFormState {
  const ov = item.overlay;
  const dp = ov?.default_props;
  const dsd = ov?.data_source_defaults;
  return {
    label: ov?.label_override ?? "",
    category: ov?.category_override ?? "",
    icon: ov?.icon_override ?? "",
    plan: ov?.required_plan_override ?? "",
    lockedProps: (ov?.locked_props ?? []).join(", "),
    defaultVariant: ov?.default_variant ?? "",
    defaultProps: dp ? JSON.stringify(dp, null, 2) : "",
    defaultPropsError: null,
    dataSourceDefaults: dsd ? JSON.stringify(dsd, null, 2) : "",
    dataSourceDefaultsError: null,
  };
}

/** Toggle one id's membership in the expanded set, returning a NEW set (never
 *  mutates the input — safe for React state). */
export function toggleExpanded(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** The set with every given id added (expand-all over the currently-listed
 *  rows). Returns a NEW set. */
export function expandAll(
  set: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.add(id);
  return next;
}

/** The set with every given id removed (collapse-all over the currently-listed
 *  rows). Other ids — e.g. rows hidden by a different tab/filter — stay open.
 *  Returns a NEW set. */
export function collapseAll(
  set: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): Set<string> {
  const next = new Set(set);
  for (const id of ids) next.delete(id);
  return next;
}

/** True iff EVERY listed id is already expanded (drives the header's
 *  expand-all ↔ collapse-all affordance). Empty list ⇒ false (nothing to
 *  collapse). */
export function allExpanded(
  set: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): boolean {
  if (ids.length === 0) return false;
  return ids.every((id) => set.has(id));
}

/** How many of the listed ids are currently expanded (header count). */
export function expandedCount(
  set: ReadonlySet<string>,
  ids: ReadonlyArray<string>,
): number {
  let n = 0;
  for (const id of ids) if (set.has(id)) n += 1;
  return n;
}
