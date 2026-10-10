/**
 * Industry-shaped ops for the first dashboard (TUL-525).
 *
 * A salon / clinic / cleaning studio books appointments. It must not open on
 * restaurant chrome (POS, Pedidos, Mesas). A cafe / restaurant sells a menu
 * and takes no appointments — those surfaces stay.
 *
 * Fail OPEN when the preset is missing or unrecognised: that is still the
 * hybrid shape that hides nothing. Only a positively appointments-shaped
 * preset without reservations loses the counter surfaces.
 */

import { resolveIndustryPreset } from "@/lib/words/presets";

/** True when this industry books appointments and does not run a host stand. */
export function isServiceAppointmentsBusiness(industryPreset: unknown): boolean {
  const features = resolveIndustryPreset(industryPreset).features;
  return features.appointments && !features.reservations;
}

/** Counter / floor / kitchen surfaces (POS, Pedidos, Mesas). */
export function industryCounterOps(industryPreset: unknown): boolean {
  return !isServiceAppointmentsBusiness(industryPreset);
}
