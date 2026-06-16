/**
 * Platform HQ · Catalog · per-field-group detail loader.
 * Service-role client — route is super_admin-gated by the platform/admin
 * layout. Server-only; never import from a client component.
 * Degrades to null/empty on failure.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type GroupDetail = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  description_en: string | null;
  description_es: string | null;
  sort_order: number;
  is_active: boolean;
  field_count: number;
  /** Distinct talent-type names this group's fields are mapped to, best-effort. */
  mapped_talent_types: string[];
};

type GroupRow = {
  id: string;
  slug: string;
  // name_en/name_es folded into name_i18n {en,es} (WS3); description_* kept.
  name_i18n: Record<string, string | null> | null;
  description_en: string | null;
  description_es: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function loadFieldGroupDetail(id: string): Promise<GroupDetail | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  try {
    const [groupR, fieldsR] = await Promise.all([
      sb
        .from("profile_field_groups")
        .select(
          "id, slug, name_i18n, description_en, description_es, sort_order, is_active",
        )
        .eq("id", id)
        .maybeSingle(),
      sb
        .from("profile_field_definitions")
        .select("id")
        .eq("field_group_id", id),
    ]);

    if (groupR.error || !groupR.data) return null;

    const group = groupR.data as GroupRow;
    const fieldIds = ((fieldsR.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    const field_count = fieldIds.length;

    // Best-effort: resolve mapped talent-type names via recommendations →
    // taxonomy_terms. Fails gracefully with an empty array.
    let mapped_talent_types: string[] = [];
    if (fieldIds.length > 0) {
      try {
        const recsR = await sb
          .from("profile_field_recommendations")
          .select("taxonomy_term_id")
          .in("field_definition_id", fieldIds);

        if (!recsR.error && recsR.data && recsR.data.length > 0) {
          const termIds = [
            ...new Set(
              (recsR.data as Array<{ taxonomy_term_id: string }>).map((r) => r.taxonomy_term_id),
            ),
          ];
          const termsR = await sb
            .from("taxonomy_terms")
            // name_en folded into name_i18n {en,es} (WS4).
            .select("name_i18n")
            .in("id", termIds)
            .order("name_i18n->>en");

          if (!termsR.error && termsR.data) {
            mapped_talent_types = (
              termsR.data as Array<{ name_i18n: Record<string, string | null> | null }>
            )
              .map((t) => t.name_i18n?.en ?? "")
              .filter((n) => n.length > 0);
          }
        }
      } catch (e) {
        logServerError("platform.catalog.groupDetail.mappedTypes", e);
      }
    }

    return {
      id: group.id,
      slug: group.slug,
      name_en: group.name_i18n?.en ?? "",
      name_es: group.name_i18n?.es ?? null,
      description_en: group.description_en,
      description_es: group.description_es,
      sort_order: group.sort_order ?? 100,
      is_active: group.is_active !== false,
      field_count,
      mapped_talent_types,
    };
  } catch (e) {
    logServerError("platform.catalog.groupDetail", e);
    return null;
  }
}
