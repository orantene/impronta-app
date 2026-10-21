"use server";

import { z } from "zod";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { answerOwnOfferLine } from "@/lib/coordinator/offer-line-confirmation.server";

/**
 * TUL-1607: a person answers for THEIR OWN line of an offer. The signed-in user
 * comes from the session (never the input); answerOwnOfferLine refuses any line
 * whose current person is not theirs. Other lines are never touched.
 */
export async function answerMyOfferLineAction(input: { lineId: string; status: "confirmed" | "declined" }) {
  await requireNotImpersonating();
  const parsed = z.object({ lineId: z.string().uuid(), status: z.enum(["confirmed", "declined"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false as const, reason: "unavailable" as const };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, reason: "not_signed_in" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return answerOwnOfferLine(admin, { userId: user.id, lineId: parsed.data.lineId, status: parsed.data.status });
}
