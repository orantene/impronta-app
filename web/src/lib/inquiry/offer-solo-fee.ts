import type { SupabaseClient } from "@supabase/supabase-js";
import { isSoloSeller } from "@/components/admin/offer/offer-solo-seller";

/**
 * TUL-380: a solo owner-talent has no workspace to pay, so her offer carries a
 * workspace fee of 0 whatever the editor sends. The editor hides the fee input,
 * but an older draft's saved fee still rode along in the snapshot; this is the
 * server-side guard. Solo = the editor's rule (a talent workspace, every
 * talent-attributed line is the actor's own) AND the workspace is not an agency
 * or hub (`workspace_type` defaults to "talent" on those) AND the actor is its
 * active owner, so hybrid staff with a talent profile keep the agency fee.
 */
export function soloSafeCoordinatorFee(input: {
  requestedFee: number;
  workspaceType: string | null | undefined;
  workspaceKind: string | null | undefined;
  actorIsOwner: boolean;
  ownTalentProfileIds: ReadonlyArray<string>;
  lineTalentProfileIds: ReadonlyArray<string | null | undefined>;
}): number {
  if (!input.actorIsOwner) return input.requestedFee;
  if (input.workspaceKind === "agency" || input.workspaceKind === "hub") return input.requestedFee;
  const solo = input.ownTalentProfileIds.some((own) =>
    isSoloSeller({
      workspaceType: input.workspaceType,
      ownTalentProfileId: own,
      lineTalentProfileIds: input.lineTalentProfileIds,
    }),
  );
  return solo ? 0 : input.requestedFee;
}

export type SoloSafeFeeResult = { ok: true; fee: number } | { ok: false };

/**
 * Reads the workspace, the actor's owner seat and talent profiles, then applies
 * `soloSafeCoordinatorFee`. A failed read is `{ ok: false }`: the caller refuses
 * the save rather than persist a fee it could not classify.
 */
export async function resolveSoloSafeCoordinatorFee(
  supabase: SupabaseClient,
  ctx: {
    tenantId: string;
    actorUserId: string;
    requestedFee: number;
    lineTalentProfileIds: ReadonlyArray<string | null | undefined>;
  },
): Promise<SoloSafeFeeResult> {
  if (!ctx.requestedFee) return { ok: true, fee: ctx.requestedFee };
  const [agency, owner, own] = await Promise.all([
    supabase.from("agencies").select("workspace_type, kind").eq("id", ctx.tenantId).maybeSingle(),
    supabase
      .from("agency_memberships")
      .select("profile_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("profile_id", ctx.actorUserId)
      .eq("role", "owner")
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("talent_profiles").select("id").eq("user_id", ctx.actorUserId),
  ]);
  if (agency.error || owner.error || own.error || !agency.data) return { ok: false };
  const row = agency.data as { workspace_type?: string | null; kind?: string | null };
  return {
    ok: true,
    fee: soloSafeCoordinatorFee({
      requestedFee: ctx.requestedFee,
      workspaceType: row.workspace_type,
      workspaceKind: row.kind,
      actorIsOwner: !!owner.data,
      ownTalentProfileIds: ((own.data ?? []) as Array<{ id: string }>).map((r) => r.id),
      lineTalentProfileIds: ctx.lineTalentProfileIds,
    }),
  };
}
