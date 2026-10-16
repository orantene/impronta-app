import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import {
  buildTalentTypeLabels,
  needsTalentTypeLabels,
  NO_TALENT_TYPE_LABELS,
  type TalentTypeLabels,
  type TalentTypeTermRow,
} from "./talent-type-labels";

export async function loadTalentTypeLabels(locale: string): Promise<TalentTypeLabels> {
  if (!needsTalentTypeLabels(locale)) return NO_TALENT_TYPE_LABELS;
  const admin = createServiceRoleClient();
  if (!admin) return NO_TALENT_TYPE_LABELS;
  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("slug, name_i18n")
    .eq("kind", "talent_type");
  if (error) {
    logServerError("directory.loadTalentTypeLabels", error);
    return NO_TALENT_TYPE_LABELS;
  }
  return buildTalentTypeLabels((data ?? []) as TalentTypeTermRow[], locale);
}
