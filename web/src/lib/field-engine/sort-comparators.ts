/**
 * Shared null-safe sort comparators (FIELD-2).
 *
 * `label` and `name` fields are typed non-null in many interfaces but arrive
 * as `null` or `undefined` at runtime when a catalog row has a blank value.
 * Calling `.localeCompare()` directly on such a field throws a TypeError that
 * crashes the entire containing `.sort()` call, silently dropping the sorted
 * list (PR #502 fixed one such instance in loadClientFieldSource).
 *
 * These generic helpers coalesce `null | undefined` to `""` before comparing,
 * making every sort site in the codebase safe without per-call-site guards.
 *
 * Usage:
 *   import { byLabel, byName } from "@/lib/field-engine/sort-comparators";
 *
 *   // standalone comparator
 *   items.sort(byLabel);
 *
 *   // as a tiebreaker after a primary numeric key
 *   items.sort((a, b) => a.displayOrder - b.displayOrder || byLabel(a, b));
 *
 *   // with a secondary string tiebreaker
 *   items.sort((a, b) => byLabel(a, b) || byKey(a, b));
 */

/** Compare two objects by their `.label` field, null/undefined → "". */
export function byLabel<T extends { label?: string | null }>(a: T, b: T): number {
  return (a.label ?? "").localeCompare(b.label ?? "");
}

/** Compare two objects by their `.name` field, null/undefined → "". */
export function byName<T extends { name?: string | null }>(a: T, b: T): number {
  return (a.name ?? "").localeCompare(b.name ?? "");
}

/**
 * Compare two objects by an arbitrary string key accessor, null/undefined → "".
 * Useful for secondary tiebreakers on non-label/name string fields while still
 * importing a single shared module.
 *
 * @example
 *   items.sort((a, b) => byLabel(a, b) || byStringKey("field_key")(a, b));
 */
export function byStringKey<T>(key: keyof T) {
  return (a: T, b: T): number => {
    const av = a[key];
    const bv = b[key];
    return (av == null ? "" : String(av)).localeCompare(
      bv == null ? "" : String(bv),
    );
  };
}
