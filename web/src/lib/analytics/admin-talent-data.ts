import { cache } from "react";
import { requireStaff } from "@/lib/server/action-guards";

export type TalentTopSavedRow = {
  talent_profile_id: string;
  display_name: string | null;
  profile_code: string | null;
  saves: number;
};

/** Rough proxy for “most saved” using `saved_talent` rows. */
export const loadTopSavedTalent = cache(
  async (limit: number): Promise<TalentTopSavedRow[] | null> => {
    const auth = await requireStaff();
    if (!auth.ok) return null;
    const { supabase } = auth;

    const { data: rows } = await supabase
      .from("saved_talent")
      .select("talent_profile_id")
      .limit(5000);

    if (!rows?.length) return [];

    const counts = new Map<string, number>();
    for (const r of rows) {
      const id = r.talent_profile_id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    const ids = sorted.map(([id]) => id);
    if (ids.length === 0) return [];

    const { data: profiles } = await supabase
      .from("talent_profiles")
      .select("id, display_name, profile_code")
      .in("id", ids);

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return sorted.map(([talent_profile_id, saves]) => {
      const p = byId.get(talent_profile_id);
      return {
        talent_profile_id,
        display_name: p?.display_name ?? null,
        profile_code: p?.profile_code ?? null,
        saves,
      };
    });
  },
);

export type WorkflowDistribution = Record<string, number>;

export const loadTalentWorkflowDistribution = cache(async (): Promise<WorkflowDistribution | null> => {
  const auth = await requireStaff();
  if (!auth.ok) return null;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("talent_profiles")
    .select("workflow_status")
    .is("deleted_at", null);

  if (error || !data) return {};

  const dist: WorkflowDistribution = {};
  for (const row of data) {
    const k = row.workflow_status ?? "unknown";
    dist[k] = (dist[k] ?? 0) + 1;
  }
  return dist;
});
