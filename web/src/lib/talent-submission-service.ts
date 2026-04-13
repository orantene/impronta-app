import type { SupabaseClient } from "@supabase/supabase-js";

export type TalentSubmissionKind = "initial_submission" | "resubmission";

export function formatSubmissionKind(kind: string | null | undefined): string {
  if (kind === "resubmission") return "Resubmission";
  if (kind === "initial_submission") return "First submission";
  return "Submission";
}

export async function resolveTalentTermsVersion(
  supabase: SupabaseClient,
): Promise<string> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "talent_terms_version")
    .maybeSingle();

  return typeof data?.value === "string" && data.value.trim().length > 0
    ? data.value.trim()
    : "2026-04-09";
}
