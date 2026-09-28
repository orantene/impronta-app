/**
 * Live-bound DTO for the shared `comp_card` builder node (measure strip).
 * Resolved server-side from public profile field values. The renderer never
 * queries and never invents measures.
 */

export type TalentCompFieldRow = {
  fieldKey: string;
  label: string;
  value: string;
  group: string;
  /** Definition unit when the value string has none (e.g. "EU"). */
  unit?: string | null;
};

export type TalentCompMeasure = {
  fieldKey: string;
  label: string;
  /** Display value without unit suffix when unit is split. */
  value: string;
  unit?: string | null;
};

export type TalentCompDetailGroup = {
  group: string;
  rows: Array<{ fieldKey: string; label: string; value: string }>;
};

export type TalentCompCardSource = {
  /** All public, non-empty field rows for this talent (unordered map source). */
  rows: TalentCompFieldRow[];
};
