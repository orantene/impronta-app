/**
 * Load public profile field rows for the shared `comp_card` widget.
 * Sources: talent_profile_field_values + profile_field_definitions.
 * Gates with effectiveFieldVisibility (public channel). Never invents values.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  canViewerSee,
  effectiveFieldVisibility,
} from "@/lib/field-engine/effective-visibility";
import { pickLocale } from "@/lib/i18n/pick-locale";

import type { TalentCompCardSource, TalentCompFieldRow } from "./comp-card-types";

type DefEmbed = {
  id: string;
  field_key: string;
  label_i18n: unknown;
  kind: string;
  unit: string | null;
  options: string[] | null;
  option_labels_i18n: unknown;
  display_order: number | null;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  default_visibility: string[] | null;
  deprecated_at: string | null;
  profile_field_groups:
    | { sort_order: number | null; slug: string | null; name_i18n: unknown }
    | { sort_order: number | null; slug: string | null; name_i18n: unknown }[]
    | null;
};

type ValueRow = {
  id: string;
  field_definition_id: string;
  value: unknown;
  visibility_override: string[] | null;
  workflow_state: "live" | "pending" | "rejected";
  profile_field_definitions: DefEmbed | DefEmbed[] | null;
};

function asLocalizedMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function labelFromI18n(raw: unknown, locale: string, fallbackKey: string): string {
  const map = asLocalizedMap(raw);
  const lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
  return map[lang] || map.en || map.es || fallbackKey.split(".").pop() || fallbackKey;
}

/**
 * Public-site group heading for a profile field group.
 * Prefer catalog `name_i18n` (ES/EN). Fall back to a small curated map, then
 * slug humanization — never English-only slug titles when the catalog has ES.
 */
export function resolveCompCardGroupLabel(
  slug: string | null,
  locale: string,
  nameI18n: unknown = null,
): string {
  if (!slug) return pickLocale(locale, { en: "Details", es: "Detalles" });
  const fromCatalog = labelFromI18n(nameI18n, locale, "");
  if (fromCatalog) return fromCatalog;
  const curated: Record<string, { en: string; es: string }> = {
    measurements: { en: "Measurements", es: "Medidas" },
    physical: { en: "Physical", es: "Físico" },
    logistics: { en: "Logistics", es: "Logística" },
    availability: { en: "Availability", es: "Disponibilidad" },
    experience: { en: "Experience", es: "Experiencia" },
    basic_info: { en: "Basics", es: "Básicos" },
  };
  const hit = curated[slug];
  if (hit) return pickLocale(locale, hit);
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function optionLabel(
  rawValue: string,
  optionLabelsI18n: unknown,
  locale: string,
): string {
  if (!optionLabelsI18n || typeof optionLabelsI18n !== "object") return rawValue;
  const perOpt = (optionLabelsI18n as Record<string, unknown>)[rawValue];
  if (!perOpt) return rawValue;
  return labelFromI18n(perOpt, locale, rawValue);
}

function formatValue(
  value: unknown,
  kind: string,
  unit: string | null,
  optionLabelsI18n: unknown,
  locale: string,
): string | null {
  const es = locale.toLowerCase().startsWith("es");
  if (kind === "number") {
    let n: number | null = null;
    if (typeof value === "number" && Number.isFinite(value)) n = value;
    else if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      n = Number(value);
    }
    if (n === null) return null;
    const u = unit?.trim();
    return u ? `${n} ${u}` : String(n);
  }
  if (kind === "boolean" || kind === "toggle") {
    if (typeof value !== "boolean") return null;
    return value ? (es ? "Sí" : "Yes") : "No";
  }
  if (kind === "multiselect" || kind === "chips") {
    if (!Array.isArray(value)) return null;
    const parts = value
      .map((v) => (typeof v === "string" ? optionLabel(v.trim(), optionLabelsI18n, locale) : ""))
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    return optionLabel(t, optionLabelsI18n, locale);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const u = unit?.trim();
    return u ? `${value} ${u}` : String(value);
  }
  return null;
}

export async function loadCompCardSources(
  talentProfileId: string,
  locale = "en",
): Promise<{ talentCompCard: TalentCompCardSource }> {
  const empty = { talentCompCard: { rows: [] as TalentCompFieldRow[] } };
  if (!talentProfileId) return empty;
  const admin = createServiceRoleClient();
  if (!admin) return empty;

  try {
    const { data, error } = await admin
      .from("talent_profile_field_values")
      .select(
        `
        id,
        field_definition_id,
        value,
        visibility_override,
        workflow_state,
        profile_field_definitions (
          id, field_key, label_i18n, kind, unit, options, option_labels_i18n,
          display_order, admin_only, is_sensitive, show_in_public,
          default_visibility, deprecated_at,
          profile_field_groups ( sort_order, slug, name_i18n )
        )
      `,
      )
      .eq("talent_profile_id", talentProfileId)
      .eq("workflow_state", "live");

    if (error) {
      logServerError("compCard.loadFieldValues", error);
      return empty;
    }

    const rows: TalentCompFieldRow[] = [];
    for (const raw of (data ?? []) as unknown as ValueRow[]) {
      const def = Array.isArray(raw.profile_field_definitions)
        ? (raw.profile_field_definitions[0] ?? null)
        : raw.profile_field_definitions;
      if (!def || def.deprecated_at) continue;

      const eff = effectiveFieldVisibility(
        {
          default_visibility: def.default_visibility,
          show_in_public: def.show_in_public,
          admin_only: def.admin_only,
          is_sensitive: def.is_sensitive,
        },
        null,
        raw.visibility_override,
      );
      if (!canViewerSee(eff, "public")) continue;

      const formatted = formatValue(
        raw.value,
        def.kind,
        def.unit,
        def.option_labels_i18n,
        locale,
      );
      if (!formatted) continue;

      // Skip legacy height_cm short key; canonical is physical.height_cm.
      if (def.field_key === "height_cm") continue;

      const fg = Array.isArray(def.profile_field_groups)
        ? (def.profile_field_groups[0] ?? null)
        : def.profile_field_groups;
      const slug = typeof fg?.slug === "string" ? fg.slug : null;

      rows.push({
        fieldKey: def.field_key,
        label: labelFromI18n(def.label_i18n, locale, def.field_key),
        value: formatted,
        group: resolveCompCardGroupLabel(slug, locale, fg?.name_i18n ?? null),
        unit: def.unit?.trim() || null,
      });
    }

    rows.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
    return { talentCompCard: { rows } };
  } catch (err) {
    logServerError("compCard.loadCompCardSources", err);
    return empty;
  }
}

/** Pure helper for tests: shape a source payload. */
export function asCompCardSource(rows: TalentCompFieldRow[]): TalentCompCardSource {
  return { rows };
}
