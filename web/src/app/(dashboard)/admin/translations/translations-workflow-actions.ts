"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/server/action-guards";
import { markSpanishBioReviewed } from "@/lib/translation/talent-bio-translation-service";
import { appendBulkTranslationAudit } from "@/lib/translation-center/bulk/translation-bulk-runner";

const bulkIdsSchema = z.object({
  talent_profile_ids: z.array(z.string().uuid()).max(250),
});

export type BulkWorkflowResult = {
  ok: number;
  failed: { id: string; message: string }[];
};

async function runBulk(
  ids: string[],
  fn: (id: string) => Promise<{ error: string | null }>,
): Promise<BulkWorkflowResult> {
  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  for (const id of ids) {
    const { error } = await fn(id);
    if (error) failed.push({ id, message: error });
    else ok += 1;
  }
  return { ok, failed };
}

export async function adminBulkMarkSpanishBioReviewed(
  input: z.infer<typeof bulkIdsSchema>,
): Promise<BulkWorkflowResult | { error: string }> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = bulkIdsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid selection." };
  const ids = parsed.data.talent_profile_ids;
  if (ids.length === 0) return { error: "Select at least one profile." };

  const res = await runBulk(ids, (id) =>
    markSpanishBioReviewed(auth.supabase, id, auth.user.id),
  );
  await appendBulkTranslationAudit(auth.supabase, {
    actorId: auth.user.id,
    eventType: "bulk_mark_reviewed",
    meta: { domainId: "talent.profile.bio", count: res.ok, failed: res.failed.length },
  });
  revalidatePath("/admin/translations");
  revalidatePath("/admin/talent");
  return res;
}

