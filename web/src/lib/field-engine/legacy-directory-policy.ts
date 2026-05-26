import type { SupabaseClient } from "@supabase/supabase-js";

import { effectiveFieldVisibility } from "@/lib/field-engine/effective-visibility";
import { OLD_TO_NEW_KEY } from "@/lib/fields/legacy-mirror";

type LegacyDirectorySurface = "directory" | "public_profile";

type CanonicalDefRow = {
  id: string;
  field_key: string;
  default_visibility: string[] | null;
  admin_only: boolean | null;
  is_sensitive: boolean | null;
  show_in_public: boolean | null;
  show_in_directory: boolean | null;
  deprecated_at: string | null;
};

type WorkspaceOverrideRow = {
  field_definition_id: string;
  enabled_override: boolean | null;
  show_in_public_override: boolean | null;
  show_in_directory_override: boolean | null;
  admin_only_override: boolean | null;
  default_visibility_override: string[] | null;
};

// The public directory still has a few legacy `field_definitions` callers.
// For bridged keys, this helper lets those callers obey the canonical engine
// lifecycle and visibility rules without migrating the value reads yet.
export async function allowedLegacyFieldKeysForPublicSurface(
  supabase: SupabaseClient,
  input: {
    tenantId: string | null;
    surface: LegacyDirectorySurface;
    oldKeys?: readonly string[];
  },
): Promise<Set<string>> {
  const candidateOldKeys = input.oldKeys?.length
    ? input.oldKeys.filter((key) => OLD_TO_NEW_KEY[key])
    : Object.keys(OLD_TO_NEW_KEY);
  const canonicalKeys = [
    ...new Set(
      candidateOldKeys
        .map((key) => OLD_TO_NEW_KEY[key])
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    ),
  ];
  if (canonicalKeys.length === 0) return new Set();

  const { data: defs, error: defsError } = await supabase
    .from("profile_field_definitions")
    .select(
      "id, field_key, default_visibility, admin_only, is_sensitive, show_in_public, show_in_directory, deprecated_at",
    )
    .in("field_key", canonicalKeys);
  if (defsError) return new Set(candidateOldKeys);

  const defRows = (defs ?? []) as CanonicalDefRow[];
  const overridesByFieldId = new Map<string, WorkspaceOverrideRow>();
  if (input.tenantId && defRows.length > 0) {
    const { data: overrides } = await supabase
      .from("workspace_profile_field_settings")
      .select(
        "field_definition_id, enabled_override, show_in_public_override, show_in_directory_override, admin_only_override, default_visibility_override",
      )
      .eq("tenant_id", input.tenantId)
      .in("field_definition_id", defRows.map((row) => row.id));
    for (const row of (overrides ?? []) as WorkspaceOverrideRow[]) {
      overridesByFieldId.set(row.field_definition_id, row);
    }
  }

  const canonicalAllowed = new Set<string>();
  for (const def of defRows) {
    if (def.deprecated_at) continue;
    const override = overridesByFieldId.get(def.id) ?? null;
    if (override?.enabled_override === false) continue;
    const visibility = effectiveFieldVisibility(
      {
        default_visibility: def.default_visibility,
        admin_only: def.admin_only,
        is_sensitive: def.is_sensitive,
        show_in_public: def.show_in_public,
      },
      override
        ? {
            show_in_public_override: override.show_in_public_override,
            admin_only_override: override.admin_only_override,
            default_visibility_override: override.default_visibility_override,
          }
        : null,
    );
    if (visibility !== "public") continue;
    if (input.surface === "directory") {
      const showInDirectory =
        override?.show_in_directory_override ?? def.show_in_directory ?? false;
      if (!showInDirectory) continue;
    }
    canonicalAllowed.add(def.field_key);
  }

  return new Set(
    candidateOldKeys.filter((oldKey) => {
      const newKey = OLD_TO_NEW_KEY[oldKey];
      return !!newKey && canonicalAllowed.has(newKey);
    }),
  );
}
