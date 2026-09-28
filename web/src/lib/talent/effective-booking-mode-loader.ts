/**
 * WSF-B loader helper. Not "server-only" so the dependency-injected storefront
 * cores (catalog-grid, package-selector) keep running under node:test; it
 * only reads through the client it is handed.
 */
import { logServerError } from "@/lib/server/safe-error";
import { withEffectiveBookingMode } from "@/lib/talent/offering-policy-resolver";
import type { OfferingBookingMode } from "@/lib/talent/offerings-types";

/**
 * WSF-B — every public loader that maps talent_offerings rows resolves an
 * inherited (null) booking mode through withEffectiveBookingMode, using each
 * owner's selling_defaults. Offerings with no talent owner, or a failed read,
 * resolve against the platform default. Explicit modes are never touched.
 */
export async function withEffectiveBookingModes<
  T extends { bookingMode: OfferingBookingMode | null; talentProfileId: string | null },
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any },
  offerings: T[],
): Promise<T[]> {
  const inheriting = offerings.filter((o) => o.bookingMode == null);
  if (inheriting.length === 0) return offerings;
  const ids = [...new Set(inheriting.map((o) => o.talentProfileId).filter((id): id is string => !!id))];
  const defaults = new Map<string, unknown>();
  if (ids.length > 0) {
    const { data, error } = await admin.from("talent_profiles").select("id, selling_defaults").in("id", ids);
    if (error) logServerError("talent.offeringPolicy/bookingModeDefaults", error);
    for (const row of (data ?? []) as { id: string; selling_defaults: unknown }[]) {
      defaults.set(row.id, row.selling_defaults ?? {});
    }
  }
  return offerings.map((o) =>
    o.bookingMode == null
      ? withEffectiveBookingMode(o, o.talentProfileId ? (defaults.get(o.talentProfileId) ?? {}) : {})
      : o,
  );
}
