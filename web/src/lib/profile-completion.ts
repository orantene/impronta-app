import type { FieldDefinitionRow, FieldValueType } from "@/lib/fields/types";
import {
  buildTalentChecklist,
  calculateTalentCompletion,
  type TalentCompletionInput,
} from "@/lib/talent-dashboard";
import { canonicalBioEn } from "@/lib/translation/public-bio";

/** Columns used to decide if a scalar field row has a value (excludes taxonomy / location). */
export type ScalarFieldValueColumns = {
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

const SCALAR_VALUE_TYPES = new Set<FieldValueType>([
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
]);

/**
 * Whether a scalar field definition has a non-empty stored value.
 * Select-style fields use value_type "text" with options in config; value lives in value_text.
 */
/** Minimal definition shape for scalar fill + completion counting. */
export type ScalarCompletionDefinition = Pick<
  FieldDefinitionRow,
  "id" | "value_type" | "required_level"
>;

export function isScalarFieldFilled(
  def: Pick<ScalarCompletionDefinition, "value_type">,
  value:
    | Pick<ScalarFieldValueColumns, "value_text" | "value_number" | "value_boolean" | "value_date">
    | undefined
    | null,
): boolean {
  if (!value) return false;
  switch (def.value_type) {
    case "text":
    case "textarea":
      return Boolean(value.value_text?.trim());
    case "number":
      return value.value_number !== null && value.value_number !== undefined;
    case "boolean":
      return value.value_boolean !== null && value.value_boolean !== undefined;
    case "date":
      return Boolean(value.value_date?.trim());
    default:
      return false;
  }
}

export function buildScalarValuesByDefinitionId(
  values: ScalarFieldValueColumns[],
): Map<string, ScalarFieldValueColumns> {
  return new Map(values.map((v) => [v.field_definition_id, v]));
}

export function countTalentFacingScalarCompletion(input: {
  definitions: ScalarCompletionDefinition[];
  valuesByFieldId: Map<string, ScalarFieldValueColumns>;
}): {
  requiredScalarComplete: number;
  recommendedScalarComplete: number;
  requiredScalarTotal: number;
  recommendedScalarTotal: number;
} {
  const scalarDefs = input.definitions.filter((d) => SCALAR_VALUE_TYPES.has(d.value_type));
  const requiredScalarDefs = scalarDefs.filter((d) => d.required_level === "required");
  const recommendedScalarDefs = scalarDefs.filter((d) => d.required_level === "recommended");
  return {
    requiredScalarTotal: requiredScalarDefs.length,
    recommendedScalarTotal: recommendedScalarDefs.length,
    requiredScalarComplete: requiredScalarDefs.filter((d) =>
      isScalarFieldFilled(d, input.valuesByFieldId.get(d.id)),
    ).length,
    recommendedScalarComplete: recommendedScalarDefs.filter((d) =>
      isScalarFieldFilled(d, input.valuesByFieldId.get(d.id)),
    ).length,
  };
}

/** Same scalar scoring inputs used by talent dashboard and submit-for-review. */
export function buildTalentCompletionInput(input: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  bio_en?: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  origin_country_id?: string | null;
  origin_city_id?: string | null;
  residence_city_id?: string | null;
  location_id?: string | null;
  mediaCount: number;
  taxonomyCount: number;
  hasPrimaryTalentType?: boolean;
  /** Typically talent-editable, profile-visible, non-internal definitions (caller filters). */
  definitionsForScalarScoring: ScalarCompletionDefinition[];
  fieldValues: ScalarFieldValueColumns[];
}): TalentCompletionInput {
  const valuesByFieldId = buildScalarValuesByDefinitionId(input.fieldValues);
  const c = countTalentFacingScalarCompletion({
    definitions: input.definitionsForScalarScoring,
    valuesByFieldId,
  });
  const bioForCompletion =
    canonicalBioEn(input.bio_en ?? null, input.short_bio) || null;
  return {
    display_name: input.display_name,
    first_name: input.first_name,
    last_name: input.last_name,
    short_bio: bioForCompletion,
    phone: input.phone,
    gender: input.gender,
    date_of_birth: input.date_of_birth,
    origin_country_id: input.origin_country_id,
    origin_city_id: input.origin_city_id,
    residence_city_id: input.residence_city_id,
    location_id: input.location_id,
    mediaCount: input.mediaCount,
    taxonomyCount: input.taxonomyCount,
    hasPrimaryTalentType: input.hasPrimaryTalentType,
    requiredScalarFieldsTotal: c.requiredScalarTotal,
    requiredScalarFieldsComplete: c.requiredScalarComplete,
    recommendedScalarFieldsTotal: c.recommendedScalarTotal,
    recommendedScalarFieldsComplete: c.recommendedScalarComplete,
  };
}

export function calculateProfileCompletionScore(input: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  origin_country_id?: string | null;
  origin_city_id?: string | null;
  residence_city_id?: string | null;
  location_id?: string | null;
  mediaCount: number;
  taxonomyCount: number;
  hasPrimaryTalentType?: boolean;
  definitionsForScalarScoring: ScalarCompletionDefinition[];
  fieldValues: ScalarFieldValueColumns[];
}): number {
  return calculateTalentCompletion(buildTalentCompletionInput(input));
}

export function buildTalentChecklistFromParts(input: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  phone?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  origin_country_id?: string | null;
  origin_city_id?: string | null;
  residence_city_id?: string | null;
  location_id?: string | null;
  mediaCount: number;
  taxonomyCount: number;
  hasPrimaryTalentType?: boolean;
  definitionsForScalarScoring: ScalarCompletionDefinition[];
  fieldValues: ScalarFieldValueColumns[];
}) {
  return buildTalentChecklist(buildTalentCompletionInput(input));
}
