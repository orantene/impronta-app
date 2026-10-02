/**
 * WSF-B loader helper. Not "server-only" so the dependency-injected storefront
 * cores (catalog-grid, package-selector) keep running under node:test; it
 * only reads through the client it is handed.
 */
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";
import { logServerError } from "@/lib/server/safe-error";
import { withEffectiveBookingMode, withPublicAvailability } from "@/lib/talent/offering-policy-resolver";
import type { OfferingBookingMode, OfferingReserveMode } from "@/lib/talent/offerings-types";
import { loadWorkingHoursPresence } from "@/lib/talent/site-switches-server";
import { isPlatformCheckoutReady } from "@/lib/talent/online-collect-ready";

/**
 * WSF-B — every public loader that maps talent_offerings rows resolves an
 * inherited (null) booking mode through withEffectiveBookingMode, using each
 * owner's selling_defaults. Offerings with no talent owner, or a failed read,
 * resolve against the platform default. Explicit modes are never touched.
 */
export async function withEffectiveBookingModes<
  T extends {
    bookingMode: OfferingBookingMode | null;
    talentProfileId: string | null;
    kind?: string;
    durationMinutes?: number | null;
    reserveMode?: OfferingReserveMode;
    allowPayInPerson?: boolean;
  },
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any },
  offerings: T[],
): Promise<T[]> {
  // WSF-C: readiness (§1 row 4) can move an explicit instant to request, so
  // every talent-owned offering with the fields readiness needs is resolved,
  // not only the inheriting ones. Agency loaders never apply the talent's
  // switches (§7); an unknown hours read never downgrades.
  const needsResolve = (o: T) =>
    o.bookingMode == null || (o.bookingMode === "instant" && !!o.talentProfileId && typeof o.kind === "string");
  const touched = offerings.filter(needsResolve);
  if (touched.length === 0) return offerings;
  const ids = [...new Set(touched.map((o) => o.talentProfileId).filter((id): id is string => !!id))];
  const defaults = new Map<string, unknown>();
  let hours = new Map<string, boolean>();
  if (ids.length > 0) {
    const { data, error } = await admin.from("talent_profiles").select("id, selling_defaults").in("id", ids);
    if (error) logServerError("talent.offeringPolicy/bookingModeDefaults", error);
    for (const row of (data ?? []) as { id: string; selling_defaults: unknown }[]) {
      defaults.set(row.id, row.selling_defaults ?? {});
    }
    if (touched.some((o) => typeof o.kind === "string")) hours = await loadWorkingHoursPresence(admin, ids);
  }
  const payoutsReady = isPlatformCheckoutReady();
  const plans = ids.length > 0 ? await loadPlanAllowsInstant(admin, ids) : new Map<string, boolean>();
  return offerings.map((o) => {
    if (!needsResolve(o)) return o;
    const d = o.talentProfileId ? (defaults.get(o.talentProfileId) ?? {}) : {};
    if (typeof o.kind !== "string" || !o.talentProfileId) return withEffectiveBookingMode(o, d);
    return withPublicAvailability(
      {
        ...o,
        kind: o.kind,
        durationMinutes: o.durationMinutes ?? null,
        reserveMode: o.reserveMode ?? "full",
      },
      d,
      {
        switches: null,
        hasWorkingHours: hours.get(o.talentProfileId) ?? null,
        payoutsReady,
        planAllowsInstant: plans.get(o.talentProfileId),
      },
    ) as T;
  });
}
