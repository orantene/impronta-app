import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANONICAL_BASIC_INFORMATION_DEFINITION_ORDER,
  isReservedTalentProfileFieldKey,
} from "@/lib/field-canonical";
import { logServerError } from "@/lib/server/safe-error";

type CanonicalMirrorSeed = {
  key: (typeof CANONICAL_BASIC_INFORMATION_DEFINITION_ORDER)[number];
  label_en: string;
  label_es: string;
  help_en: string;
  help_es: string;
  value_type: "text" | "textarea" | "number" | "date" | "boolean" | "location";
  required_level: "optional" | "recommended" | "required";
  public_visible: boolean;
  internal_only: boolean;
  card_visible: boolean;
  profile_visible: boolean;
  filterable: boolean;
  searchable: boolean;
  ai_visible: boolean;
  editable_by_talent: boolean;
  editable_by_staff: boolean;
  editable_by_admin: boolean;
  sort_order: number;
  /** Merged into `field_definitions.config` on insert (e.g. text facet options). */
  config?: Record<string, unknown>;
};

/**
 * Default mirror rows for Admin → Fields (basic_info). Values live on talent_profiles;
 * these rows exist for labels, ordering context, and visibility toggles.
 * Keeps local/prod DBs consistent even when a SQL restore migration was skipped.
 */
const BASIC_INFO_CANONICAL_SEEDS: CanonicalMirrorSeed[] = [
  {
    key: "display_name",
    label_en: "Display name",
    label_es: "Nombre para mostrar",
    help_en: "Shown on your public profile and across the directory.",
    help_es: "Visible en tu perfil público y el directorio.",
    value_type: "text",
    required_level: "recommended",
    public_visible: true,
    internal_only: false,
    card_visible: false,
    profile_visible: true,
    filterable: true,
    searchable: true,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 10,
  },
  {
    key: "first_name",
    label_en: "First name",
    label_es: "Nombre",
    help_en: "Internal only. Used for contracts and administration.",
    help_es: "Solo interno. Usado para contratos y administración.",
    value_type: "text",
    required_level: "recommended",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 20,
  },
  {
    key: "last_name",
    label_en: "Last name",
    label_es: "Apellido",
    help_en: "Internal only. Used for contracts and administration.",
    help_es: "Solo interno. Usado para contratos y administración.",
    value_type: "text",
    required_level: "recommended",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 30,
  },
  {
    key: "phone",
    label_en: "Phone",
    label_es: "Teléfono",
    help_en: "Contact phone stored on the talent profile.",
    help_es: "Teléfono de contacto en el perfil del talento.",
    value_type: "text",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: false,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 40,
  },
  {
    key: "gender",
    label_en: "Gender",
    label_es: "Género",
    help_en: "Stored on the talent profile. Can be exposed as a directory facet when enabled under Filters.",
    help_es: "Guardado en el perfil del talento. Puede mostrarse como faceta del directorio si se activa.",
    value_type: "text",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: true,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 50,
    config: {
      filter_options: ["Female", "Male", "Non-binary", "Other", "Prefer not to say"],
    },
  },
  {
    key: "date_of_birth",
    label_en: "Date of birth",
    label_es: "Fecha de nacimiento",
    help_en: "Internal only. Do not share publicly unless the agency requests it.",
    help_es: "Solo interno. No se comparte públicamente.",
    value_type: "date",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 60,
  },
  {
    key: "residence_country_id",
    label_en: "Residence country",
    label_es: "País de residencia",
    help_en: "Canonical geography (FK). Edited on the talent profile form, not as field_values.",
    help_es: "Geografía canónica (FK). Se edita en el formulario del perfil.",
    value_type: "text",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 70,
  },
  {
    key: "residence_city_id",
    label_en: "Residence city",
    label_es: "Ciudad de residencia",
    help_en: "Canonical geography (FK). Edited on the talent profile form, not as field_values.",
    help_es: "Geografía canónica (FK). Se edita en el formulario del perfil.",
    value_type: "text",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 80,
  },
  {
    key: "origin_country_id",
    label_en: "Origin country",
    label_es: "País de origen",
    help_en: "Canonical geography (FK). Edited on the talent profile form, not as field_values.",
    help_es: "Geografía canónica (FK). Se edita en el formulario del perfil.",
    value_type: "text",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 90,
  },
  {
    key: "origin_city_id",
    label_en: "Origin city",
    label_es: "Ciudad de origen",
    help_en: "Canonical geography (FK). Edited on the talent profile form, not as field_values.",
    help_es: "Geografía canónica (FK). Se edita en el formulario del perfil.",
    value_type: "text",
    required_level: "optional",
    public_visible: false,
    internal_only: true,
    card_visible: false,
    profile_visible: false,
    filterable: false,
    searchable: false,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 100,
  },
  {
    key: "short_bio",
    label_en: "Short bio",
    label_es: "Bio corta",
    help_en: "Concise positioning and experience summary.",
    help_es: "Resumen conciso de posicionamiento y experiencia.",
    value_type: "textarea",
    required_level: "recommended",
    public_visible: true,
    internal_only: false,
    card_visible: false,
    profile_visible: true,
    filterable: true,
    searchable: true,
    ai_visible: true,
    editable_by_talent: true,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 110,
  },
  {
    key: "location",
    label_en: "Location",
    label_es: "Ubicación",
    help_en: "Legacy mirror for residence; canonical value is talent_profiles.location_id.",
    help_es: "Espejo heredado; el valor canónico es talent_profiles.location_id.",
    value_type: "location",
    required_level: "recommended",
    public_visible: true,
    internal_only: false,
    card_visible: true,
    profile_visible: true,
    filterable: true,
    searchable: true,
    ai_visible: true,
    editable_by_talent: false,
    editable_by_staff: true,
    editable_by_admin: true,
    sort_order: 120,
  },
];

/**
 * Ensures every reserved Basic Information key has an active `field_definitions` row
 * under `field_groups.slug = basic_info`. Idempotent; safe to call on each admin load.
 */
export async function ensureBasicInfoCanonicalMirrors(
  supabase: SupabaseClient,
): Promise<{ repaired: boolean }> {
  let repaired = false;

  const { data: bi, error: biErr } = await supabase
    .from("field_groups")
    .select("id")
    .eq("slug", "basic_info")
    .is("archived_at", null)
    .maybeSingle();

  if (biErr) {
    logServerError("ensureBasicInfoCanonicalMirrors/basic_info_group", biErr);
    return { repaired: false };
  }
  if (!bi?.id) return { repaired: false };

  const basicInfoId = bi.id as string;

  const keys = [...CANONICAL_BASIC_INFORMATION_DEFINITION_ORDER];
  const { data: existingRows, error: exErr } = await supabase
    .from("field_definitions")
    .select("id, key, field_group_id, archived_at")
    .in("key", keys);

  if (exErr) {
    logServerError("ensureBasicInfoCanonicalMirrors/load_existing", exErr);
    return { repaired: false };
  }

  const byKey = new Map((existingRows ?? []).map((r) => [r.key as string, r]));

  for (const seed of BASIC_INFO_CANONICAL_SEEDS) {
    if (!isReservedTalentProfileFieldKey(seed.key)) continue;

    const row = byKey.get(seed.key);
    if (row) {
      const needsGroup = row.field_group_id !== basicInfoId;
      const wasArchived = row.archived_at != null;
      if (needsGroup || wasArchived) {
        const { error: upErr } = await supabase
          .from("field_definitions")
          .update({
            field_group_id: basicInfoId,
            archived_at: null,
            active: true,
            sort_order: seed.sort_order,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (upErr) {
          logServerError(`ensureBasicInfoCanonicalMirrors/repair/${seed.key}`, upErr);
          continue;
        }
        repaired = true;
      }
      continue;
    }

    const { error: insErr } = await supabase.from("field_definitions").insert({
      field_group_id: basicInfoId,
      key: seed.key,
      label_en: seed.label_en,
      label_es: seed.label_es,
      help_en: seed.help_en,
      help_es: seed.help_es,
      value_type: seed.value_type,
      required_level: seed.required_level,
      public_visible: seed.public_visible,
      internal_only: seed.internal_only,
      card_visible: seed.card_visible,
      profile_visible: seed.profile_visible,
      filterable: seed.filterable,
      directory_filter_visible: seed.filterable,
      searchable: seed.searchable,
      ai_visible: seed.ai_visible,
      editable_by_talent: seed.editable_by_talent,
      editable_by_staff: seed.editable_by_staff,
      editable_by_admin: seed.editable_by_admin,
      active: true,
      sort_order: seed.sort_order,
      taxonomy_kind: null,
      config: seed.config ?? {},
      updated_at: new Date().toISOString(),
    });

    if (insErr) {
      logServerError(`ensureBasicInfoCanonicalMirrors/insert/${seed.key}`, insErr);
      continue;
    }
    repaired = true;
  }

  return { repaired };
}
