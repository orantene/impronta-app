"use server";

/** TUL-633 · save/approve one suggested price. super_admin only, validated, service-role write. */

import { revalidatePath } from "next/cache";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { parseSuggestionPatch, toMinor } from "@/lib/pricing/suggestion-input";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function saveSuggestionAction(formData: FormData): Promise<void> {
  await requireNotImpersonating();
  const session = await getCachedActorSession();
  if (!session.user || !isPlatformAdmin(session.profile)) return;
  const parsed = parseSuggestionPatch(formData);
  if (!parsed.ok) return;
  const db = createServiceRoleClient();
  if (!db) return;
  const { patch } = parsed;
  const { error } = await db
    .from("service_price_suggestions")
    .update({
      amount_minor: toMinor(patch.amountMajor),
      duration_minutes: patch.durationMinutes,
      status: patch.status,
      updated_by: session.user.id,
    })
    .eq("id", patch.id);
  if (error) throw new Error("Could not save the suggested price.");
  revalidatePath("/platform/admin/price-suggestions");
}
