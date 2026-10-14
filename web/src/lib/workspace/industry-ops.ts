/**
 * Industry-shaped ops for the first dashboard (TUL-525).
 *
 * A salon / clinic / cleaning studio books appointments. It must not open on
 * restaurant chrome (POS, Pedidos, Mesas). A cafe / restaurant sells a menu
 * and takes no appointments — those surfaces stay.
 *
 * Counter surfaces are an ALLOW-list of food and drink presets (PM ruling
 * 2026-10-10, TUL-568). A missing, unrecognised or "custom" preset gets the
 * minimal set (site, booking, inbox, agenda), never a restaurant shell.
 */

import { parseIndustryPresetId, resolveIndustryPreset, type IndustryPresetId } from "@/lib/words/presets";

const COUNTER_OPS_PRESETS: ReadonlySet<IndustryPresetId> = new Set(["restaurant", "bar_club", "beach_club"]);

/** True when this industry books appointments and does not run a host stand. */
export function isServiceAppointmentsBusiness(industryPreset: unknown): boolean {
  const features = resolveIndustryPreset(industryPreset).features;
  return features.appointments && !features.reservations;
}

/** Counter / floor / kitchen surfaces (POS, Pedidos, Mesas). */
export function industryCounterOps(industryPreset: unknown): boolean {
  return COUNTER_OPS_PRESETS.has(parseIndustryPresetId(industryPreset));
}
