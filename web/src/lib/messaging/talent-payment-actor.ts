import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "./refusals";
import { loadOwnedTalentInquiry, loadTalentActor } from "./talent-actor";
import { talentPaymentRefusal } from "./talent-pov";
import type { MessagingRefusal } from "./types";

export type TalentPaymentActor = {
  ok: true;
  tenantId: string;
  userId: string;
  admin: SupabaseClient;
  supabase: SupabaseClient;
};

/**
 * Staff already failed. A participant on her own hub sale may use the same
 * payment writer. A participant on an agency sale is told no. Anyone else
 * is not allowed.
 */
export async function talentSellerPaymentActor(
  inquiryId: string,
): Promise<TalentPaymentActor | { ok: false; reason: MessagingRefusal }> {
  const actor = await loadTalentActor();
  if (!actor.ok) return actor;
  const owned = await loadOwnedTalentInquiry(actor.admin, actor.talentProfileId, inquiryId);
  if (!owned.ok) return fail("not_allowed");
  const refusal = talentPaymentRefusal(owned.isSeller);
  if (refusal) return fail(refusal);
  return {
    ok: true,
    tenantId: owned.tenantId,
    userId: actor.userId,
    admin: actor.admin,
    supabase: actor.supabase,
  };
}
