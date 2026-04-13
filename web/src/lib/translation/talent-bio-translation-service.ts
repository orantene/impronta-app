import type { SupabaseClient } from "@supabase/supabase-js";

import {
  appendTranslationAudit,
  type TranslationAuditInput,
} from "@/lib/translation/audit";
import type { BioEsStatus } from "@/lib/translation/bio-es-status";
import { canonicalBioEn } from "@/lib/translation/public-bio";
import { translateBioEnToEs } from "@/lib/translation/ai-translate-bio";

export type TalentBioRow = {
  bio_en: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
  short_bio: string | null;
};

export function nextBioEsStatusAfterEnglishChanged(
  prev: BioEsStatus,
  publishedEs: string | null | undefined,
): BioEsStatus | null {
  const es = (publishedEs ?? "").trim();
  if (!es) return null;
  if (prev === "stale") return null;
  return "stale";
}

function normBio(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** Merge into admin `updateTalentProfile` payload when English bio text changed. */
export function buildBioEnEditExtras(args: {
  talentProfileId: string;
  prev: TalentBioRow;
  nextShortBio: string | null;
  actorId: string;
  nowIso: string;
}): { payload: Record<string, unknown>; audit: TranslationAuditInput | null } {
  const next = args.nextShortBio;
  const prevEn = normBio(canonicalBioEn(args.prev.bio_en, args.prev.short_bio));
  const nextEn = normBio(next);
  const payload: Record<string, unknown> = {
    short_bio: next,
    bio_en: next,
  };
  let audit: TranslationAuditInput | null = null;
  if (prevEn !== nextEn) {
    payload.bio_en_updated_at = args.nowIso;
    const prevStatus = (args.prev.bio_es_status ?? "missing") as BioEsStatus;
    const stale = nextBioEsStatusAfterEnglishChanged(prevStatus, args.prev.bio_es);
    if (stale) {
      payload.bio_es_status = stale;
      audit = {
        entityType: "talent_profile",
        entityId: args.talentProfileId,
        fieldName: "bio_es",
        actorId: args.actorId,
        actorKind: "user",
        eventType: "en_changed_mark_stale",
        prevStatus,
        nextStatus: stale,
        meta: {},
      };
    }
  }
  return { payload, audit };
}

export async function loadTalentBioRow(
  supabase: SupabaseClient,
  talentProfileId: string,
): Promise<{ row: TalentBioRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("bio_en, bio_es, bio_es_draft, bio_es_status, short_bio")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: data as TalentBioRow | null, error: null };
}

/** Missing ES: AI writes published `bio_es`, status `auto` (plan §0). */
export async function aiFillMissingSpanishBio(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string | null,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const en = (row.bio_en ?? row.short_bio ?? "").trim();
  if (!en) return { error: "English bio is empty." };

  const esPublished = (row.bio_es ?? "").trim();
  if (esPublished) return { error: "Spanish bio already exists; use refresh draft for approved profiles." };

  const prevStatus = (row.bio_es_status ?? "missing") as BioEsStatus;
  const tr = await translateBioEnToEs(en);
  if (!tr.ok) {
    return { error: tr.message };
  }
  const translated = tr.text;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es: translated,
      bio_es_status: "auto",
      bio_es_updated_at: now,
      updated_at: now,
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es",
    actorId,
    actorKind: "user",
    eventType: "ai_fill_missing_published",
    prevStatus,
    nextStatus: "auto",
    meta: { model: "gpt-4o-mini" },
  });

  return { error: null };
}

/** Approved (or locked) Spanish: AI writes draft only (plan §0). */
export async function aiRefreshSpanishBioDraft(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string | null,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const status = (row.bio_es_status ?? "missing") as BioEsStatus;
  if (status !== "approved") {
    return { error: "Draft refresh applies only when Spanish status is approved." };
  }

  const en = (row.bio_en ?? row.short_bio ?? "").trim();
  if (!en) return { error: "English bio is empty." };

  const tr = await translateBioEnToEs(en);
  if (!tr.ok) {
    return { error: tr.message };
  }
  const translated = tr.text;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es_draft: translated,
      updated_at: now,
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es_draft",
    actorId,
    actorKind: "ai",
    eventType: "ai_refresh_draft",
    prevStatus: status,
    nextStatus: status,
    meta: { model: "gpt-4o-mini" },
  });

  return { error: null };
}

/** Non-approved: AI may refresh published Spanish directly. */
export async function aiRefreshSpanishBioPublishedWhenNotApproved(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string | null,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const status = (row.bio_es_status ?? "missing") as BioEsStatus;
  if (status === "approved") {
    return { error: "Use draft refresh for approved Spanish." };
  }

  const en = (row.bio_en ?? row.short_bio ?? "").trim();
  if (!en) return { error: "English bio is empty." };

  const tr = await translateBioEnToEs(en);
  if (!tr.ok) {
    return { error: tr.message };
  }
  const translated = tr.text;
  const prevStatus = status;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es: translated,
      bio_es_status: "auto",
      bio_es_updated_at: now,
      bio_es_draft: null,
      updated_at: now,
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es",
    actorId,
    actorKind: "ai",
    eventType: "ai_refresh_published",
    prevStatus,
    nextStatus: "auto",
    meta: { model: "gpt-4o-mini" },
  });

  return { error: null };
}

export async function saveManualSpanishBio(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
  text: string | null,
): Promise<{ error: string | null }> {
  const trimmed = (text ?? "").trim();
  const now = new Date().toISOString();
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };
  const prevStatus = (row.bio_es_status ?? "missing") as BioEsStatus;
  const prevPublished = (row.bio_es ?? "").trim();
  const publishedTextChanged = prevPublished !== trimmed;

  const patch: Record<string, unknown> = {
    bio_es: trimmed || null,
    bio_es_status: trimmed ? "reviewed" : "missing",
    updated_at: now,
  };
  if (publishedTextChanged) {
    patch.bio_es_updated_at = now;
  }

  const { error } = await supabase
    .from("talent_profiles")
    .update(patch)
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es",
    actorId,
    actorKind: "user",
    eventType: "manual_edit_es",
    prevStatus,
    nextStatus: trimmed ? "reviewed" : "missing",
    meta: {},
  });

  return { error: null };
}

export async function approveSpanishBioDraft(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const draft = (row.bio_es_draft ?? "").trim();
  if (!draft) return { error: "No draft to approve." };

  const prevStatus = (row.bio_es_status ?? "missing") as BioEsStatus;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es: draft,
      bio_es_draft: null,
      bio_es_status: "approved",
      bio_es_updated_at: now,
      updated_at: now,
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es",
    actorId,
    actorKind: "user",
    eventType: "approve_draft",
    prevStatus,
    nextStatus: "approved",
    meta: {},
  });

  return { error: null };
}

/** Mark published Spanish as reviewed without changing text (admin workflow). */
export async function markSpanishBioReviewed(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const es = normBio(row.bio_es);
  if (!es) return { error: "No Spanish bio to mark reviewed." };

  const prevStatus = (row.bio_es_status ?? "missing") as BioEsStatus;
  if (prevStatus === "approved" || prevStatus === "reviewed") {
    return { error: null };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es_status: "reviewed",
      updated_at: now,
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es",
    actorId,
    actorKind: "user",
    eventType: "mark_reviewed",
    prevStatus,
    nextStatus: "reviewed",
    meta: {},
  });

  return { error: null };
}

export async function markSpanishBioApproved(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const es = (row.bio_es ?? "").trim();
  if (!es) return { error: "No Spanish bio to approve." };

  const prevStatus = (row.bio_es_status ?? "missing") as BioEsStatus;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es_status: "approved",
      updated_at: now,
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_es",
    actorId,
    actorKind: "user",
    eventType: "mark_approved",
    prevStatus,
    nextStatus: "approved",
    meta: {},
  });

  return { error: null };
}
