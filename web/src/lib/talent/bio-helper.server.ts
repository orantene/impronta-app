import "server-only";

/**
 * Data side of the writing helper: the talent's own facts and bio, the daily
 * cap, the write. Lives here (not in the server action) so the reads are
 * scoped to the signed-in talent by construction: every query keys on the
 * profile id that `loadPlatformTalentSelfProfile` resolved for this user.
 */

import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
import { WRITING_HELPER_DAILY_CAP, type WritingFacts } from "@/lib/ai/writing-helper";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { syncBlobFieldValuesToCatalog } from "@/lib/talent/blob-field-values-catalog";
import { buildDailyAiCapQuery } from "@/lib/translation/talent-field-translate";
import { loadPlatformTalentSelfProfile, requirePlatformTalentContext } from "@/lib/talent/platform-talent-context";

export type BioSelf = { id: string; tenantId: string | null; text: string; facts: WritingFacts };

export async function selfFacts(): Promise<BioSelf | null> {
  const session = await getCachedActorSession();
  if (!session.user) return null;
  const ctx = await requirePlatformTalentContext();
  const profile = await loadPlatformTalentSelfProfile(session.user.id);
  if (!profile) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [{ data: row, error }, { data: offerings }, { data: langs }] = await Promise.all([
    admin.from("talent_profiles").select("id, display_name, short_bio").eq("id", profile.id).maybeSingle<{ id: string; display_name: string | null; short_bio: string | null }>(),
    admin.from("talent_offerings").select("title").eq("talent_profile_id", profile.id).limit(12),
    admin.from("talent_languages").select("language_name").eq("talent_profile_id", profile.id).limit(6),
  ]);
  if (error || !row) {
    if (error) logServerError("writingHelper.selfFacts", error);
    return null;
  }
  return {
    id: row.id,
    tenantId: ctx.tenantId,
    text: row.short_bio ?? "",
    facts: {
      name: row.display_name,
      discipline: profile.primaryTypeLabel,
      city: profile.homeCity,
      services: (offerings ?? []).map((o: { title: string | null }) => o.title ?? "").filter(Boolean),
      languages: (langs ?? []).map((l: { language_name: string | null }) => l.language_name ?? "").filter(Boolean),
    },
  };
}


/**
 * Per-day AI usage cap. Rows come from `recordAiGenerationUsage`, which writes
 * `action = "generate_section"` with the real scope in `context_jsonb`; the old
 * filter on `action = "writing_helper"` matched nothing, so the cap never fired.
 * Counts one scope, and one talent when `talentProfileId` is given.
 */
export async function underDailyCap(
  tenantId: string,
  opts: { scope?: string; talentProfileId?: string | null; cap?: number } = {},
): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const q = buildDailyAiCapQuery({ tenantId, scope: opts.scope ?? "writing_helper", talentProfileId: opts.talentProfileId ?? null });
  let query = admin.from(q.table).select("id", { count: "exact", head: true });
  for (const [col, val] of q.eq) query = query.eq(col, val);
  const { count, error } = await query.contains(q.contains.column, q.contains.value).gte("created_at", q.gteCreatedAt);
  if (error) {
    logServerError("writingHelper.cap", error);
    return false;
  }
  return (count ?? 0) < (opts.cap ?? WRITING_HELPER_DAILY_CAP);
}


export async function writeMyBio(self: BioSelf, text: string, locale: "es" | "en"): Promise<{ ok: true } | { ok: false; code: "failed" }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "failed" };
  const { error } = await admin.from("talent_profiles").update({ short_bio: text }).eq("id", self.id);
  if (error) {
    logServerError("writingHelper.save", error);
    return { ok: false, code: "failed" };
  }
  try {
    await syncBlobFieldValuesToCatalog(admin, self.id, self.tenantId, { bios: [{ locale, text }] });
  } catch (err) {
    logServerError("writingHelper.catalog", err);
  }
  const session = await getCachedActorSession();
  if (session.supabase) await scheduleRebuildAiSearchDocument(session.supabase, self.id);
  return { ok: true };
}
