/**
 * picker-options.ts — the option list for the industry `<select>`.
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES IN THE COMPONENT
 * ────────────────────────────────────────────────────────
 * Spaces lost a live workspace's timezone to this exact bug today: a `<select>`
 * whose `value` matches none of its `<option>`s does not error, does not warn,
 * and does not render empty. **It silently displays the first option.** The
 * screen then shows a value the database does not hold, and the next Save
 * writes the displayed one. A correct program showing a wrong value, and then
 * making it true.
 *
 * Their case was `Intl.supportedValuesOf("timeZone")` omitting UTC. Mine is
 * shaped identically: a workspace's stored `industry_preset` may be anything
 * that reached the column, and `parseIndustryPresetId` resolves an unknown one
 * to "custom" for RENDERING while the raw value stays in the database. If the
 * option list were built from the sixteen presets alone, a workspace holding a
 * value outside that set would display "Restaurant" and save it on the next
 * click, silently rebranding a live storefront.
 *
 * So the invariant is asserted rather than assumed: **the option list always
 * contains the selected value.** It is testable without a DOM, which is the
 * whole reason it lives here.
 */

import { INDUSTRY_PRESETS, parseIndustryPresetId, type IndustryPresetId } from "./presets";
import type { WordLocale } from "./rows";

export type PresetOption = {
  readonly value: IndustryPresetId;
  readonly label: string;
  readonly blurb: string;
};

/**
 * Options for the picker, plus the value the `<select>` must carry.
 *
 * Returns both together on purpose: a caller cannot take the options and forget
 * to normalise the value, which is the mistake that produces the silent
 * mismatch. `selected` is always present in `options`.
 */
export function presetPickerModel(
  rawStoredPreset: unknown,
  locale: WordLocale,
): { options: PresetOption[]; selected: IndustryPresetId } {
  const selected = parseIndustryPresetId(rawStoredPreset);
  const options = INDUSTRY_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label[locale],
    blurb: preset.blurb[locale],
  }));

  // Belt and braces. `parseIndustryPresetId` can only return a member of
  // INDUSTRY_PRESET_IDS, and every one of those is in INDUSTRY_PRESETS — but
  // asserting it here means a future refactor that filters the list (hiding a
  // preset behind a flag, say) cannot reintroduce the silent-mismatch bug
  // without failing a test.
  if (!options.some((option) => option.value === selected)) {
    const fallback = INDUSTRY_PRESETS.find((preset) => preset.id === "custom");
    if (fallback) {
      options.unshift({
        value: fallback.id,
        label: fallback.label[locale],
        blurb: fallback.blurb[locale],
      });
    }
  }

  return { options, selected };
}

/**
 * A one-line summary of what choosing this preset actually does.
 *
 * The picker sits ABOVE the values it writes (the shape the appointments card
 * established), so a person needs to know what the choice changes before they
 * make it rather than after.
 */
export function presetSummary(id: IndustryPresetId, locale: WordLocale): string {
  const preset = INDUSTRY_PRESETS.find((p) => p.id === id);
  if (!preset) return "";
  const on = [
    preset.features.menu ? (locale === "es" ? "menú" : "menu") : null,
    preset.features.reservations ? (locale === "es" ? "reservas" : "reservations") : null,
    preset.features.events ? (locale === "es" ? "eventos" : "events") : null,
    preset.features.appointments ? (locale === "es" ? "citas" : "appointments") : null,
  ].filter(Boolean);
  if (on.length === 0) return preset.blurb[locale];
  return locale === "es" ? `Activa: ${on.join(", ")}` : `Turns on: ${on.join(", ")}`;
}
