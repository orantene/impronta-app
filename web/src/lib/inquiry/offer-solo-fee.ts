import type { SupabaseClient } from "@supabase/supabase-js";
import { isSoloSeller } from "@/components/admin/offer/offer-solo-seller";

/**
 * TUL-380: a solo owner-talent has no workspace to pay, so her offer carries a
 * workspace fee of 0 whatever the editor sends. The editor hides the fee input,
 * but an older draft's saved fee still rode along in the snapshot; this is the
 * server-side guard. Same rule as the editor: a talent workspace, and every
 * talent-attributed line is one of the actor's own talent profiles.
 */
export function soloSafeCoordinatorFee(input: {
  requestedFee: number;
  workspaceType: string | null | undefined;
  ownTalentProfileIds: ReadonlyArray<string>;
  lineTalentProfileIds: ReadonlyArray<string | null | undefined>;
}): number {
  const solo = input.ownTalentProfileIds.some((own) =>
    isSoloSeller({
      workspaceType: input.workspaceType,
      ownTalentProfileId: own,
      lineTalentProfileIds: input.lineTalentProfileIds,
    }),
  );
  return solo ? 0 : input.requestedFee;
}

/** Reads the workspace type and the actor's talent profiles, then applies `soloSafeCoordinatorFee`. */
export async function resolveSoloSafeCoordinatorFee(
  supabase: SupabaseClient,
  ctx: {
    tenantId: string;
    actorUserId: string;
    requestedFee: number;
    lineTalentProfileIds: ReadonlyArray<string | null | undefined>;
  },
): Promise<number> {
  if (!ctx.requestedFee) return ctx.requestedFee;
  const [{ data: agency }, { data: own }] = await Promise.all([
    supabase.from("agencies").select("workspace_type").eq("id", ctx.tenantId).maybeSingle(),
    supabase.from("talent_profiles").select("id").eq("user_id", ctx.actorUserId),
  ]);
  return soloSafeCoordinatorFee({
    requestedFee: ctx.requestedFee,
    workspaceType: (agency as { workspace_type?: string | null } | null)?.workspace_type,
    ownTalentProfileIds: ((own ?? []) as Array<{ id: string }>).map((r) => r.id),
    lineTalentProfileIds: ctx.lineTalentProfileIds,
  });
}
