"use client";

// ============================================================================
// talent-self-fields-editor.tsx — Mounts LiveCategoryFieldsEditor in
// talent-self mode. Routes the editor's value + visibility writes through
// the talent-side server actions (requireTalent + ownership + the
// editable_by_talent gate).
//
// Lives next to the route page (/talent/profile/fields) rather than under
// admin/shell because the route is talent-scoped — coupling to the admin
// shell would drag in unrelated dependencies.
// ============================================================================

import { LiveCategoryFieldsEditor } from "@/components/admin/shell/internal/live-category-fields-editor";
import {
  getFieldsForTalentAsTalent,
  getTalentFieldValuesAsTalent,
  setTalentFieldValueAsTalent,
  setTalentFieldVisibilityAsTalent,
} from "@/lib/server-actions/talent-field-values-catalog";

export function TalentSelfFieldsEditor({ talentProfileId }: { talentProfileId: string }) {
  return (
    <LiveCategoryFieldsEditor
      talentProfileId={talentProfileId}
      viewMode="talent-self"
      serverActions={{
        getFields: (input) => getFieldsForTalentAsTalent(input),
        getValues: (input) => getTalentFieldValuesAsTalent(input),
        setValue: (input) => setTalentFieldValueAsTalent(input),
        setVisibility: (input) => setTalentFieldVisibilityAsTalent(input),
      }}
    />
  );
}
