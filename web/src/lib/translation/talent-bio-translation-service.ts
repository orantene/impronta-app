import type { SupabaseClient } from "@supabase/supabase-js";

import { scheduleRebuildAiSearchDocument } from "@/lib/ai/schedule-rebuild-ai-search-document";
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
  bio_en_draft: string | null;
  bio_en_status: string | null;
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

/** When Spanish published text changes, mark English stale if English had published copy. */
export function nextBioEnStatusAfterSpanishChanged(
  prevEn: BioEsStatus,
  hasEnglishPublished: boolean,
): BioEsStatus | null {
  if (!hasEnglishPublished) return null;
  if (prevEn === "stale") return null;
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
  const nextEn = normBio(next);
  const prevEnStatus = (args.prev.bio_en_status ?? "missing") as BioEsStatus;

  /** Locked English: profile form edits go to English draft only (published stays live). */
  if (prevEnStatus === "approved") {
    const prevDraft = normBio(args.prev.bio_en_draft);
    if (nextEn === prevDraft) {
      return { payload: {}, audit: null };
    }
    return {
      payload: {
        bio_en_draft: nextEn || null,
        updated_at: args.nowIso,
      },
      audit: {
        entityType: "talent_profile",
        entityId: args.talentProfileId,
        fieldName: "bio_en_draft",
        actorId: args.actorId,
        actorKind: "user",
        eventType: "manual_edit_en_draft",
        prevStatus: prevEnStatus,
        nextStatus: prevEnStatus,
        meta: {},
      },
    };
  }

  const prevEn = normBio(canonicalBioEn(args.prev.bio_en, args.prev.short_bio));
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
    .select("bio_en, bio_es, bio_es_draft, bio_es_status, bio_en_draft, bio_en_status, short_bio")
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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

  return { error: null };
}

/** Refresh live `bio_es` from English regardless of legacy `bio_es_status` (clears Spanish draft buffer). */
export async function aiRefreshSpanishBioLive(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string | null,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const en = (row.bio_en ?? row.short_bio ?? "").trim();
  if (!en) return { error: "English bio is empty." };

  const tr = await translateBioEnToEs(en);
  if (!tr.ok) {
    return { error: tr.message };
  }
  const translated = tr.text;
  const prevStatus = (row.bio_es_status ?? "missing") as BioEsStatus;
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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

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

  /** Approved / locked published copy: edits go to draft until promoted (Translation Center hub). */
  if (prevStatus === "approved") {
    const { error } = await supabase
      .from("talent_profiles")
      .update({
        bio_es_draft: trimmed.length > 0 ? trimmed : null,
        updated_at: now,
      })
      .eq("id", talentProfileId);
    if (error) return { error: error.message };

    await appendTranslationAudit(supabase, {
      entityType: "talent_profile",
      entityId: talentProfileId,
      fieldName: "bio_es_draft",
      actorId,
      actorKind: "user",
      eventType: "manual_edit_es_draft",
      prevStatus,
      nextStatus: prevStatus,
      meta: {},
    });

    await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

    return { error: null };
  }

  const patch: Record<string, unknown> = {
    bio_es: trimmed || null,
    bio_es_status: trimmed ? "reviewed" : "missing",
    updated_at: now,
  };
  if (publishedTextChanged) {
    patch.bio_es_updated_at = now;
  }

  const enCanon = normBio(canonicalBioEn(row.bio_en, row.short_bio));
  if (publishedTextChanged && enCanon) {
    const prevEnSt = (row.bio_en_status ?? "missing") as BioEsStatus;
    const enStale = nextBioEnStatusAfterSpanishChanged(prevEnSt, true);
    if (enStale) {
      patch.bio_en_status = enStale;
    }
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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

  return { error: null };
}

/** One-shot save for Translation Center quick edit: four tracked strings (published + draft per locale). */
export async function saveTalentBioQuickEdit(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
  input: {
    bio_en_published: string;
    bio_en_draft: string;
    bio_es_published: string;
    bio_es_draft: string;
  },
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const now = new Date().toISOString();
  const enStatus = (row.bio_en_status ?? "missing") as BioEsStatus;
  const esStatus = (row.bio_es_status ?? "missing") as BioEsStatus;

  const nextEnPub = normBio(input.bio_en_published);
  const nextEnDraft = normBio(input.bio_en_draft);
  const nextEsPub = normBio(input.bio_es_published);
  const nextEsDraft = normBio(input.bio_es_draft);

  const prevEnPub = normBio(canonicalBioEn(row.bio_en, row.short_bio));
  const prevEnDraft = normBio(row.bio_en_draft);
  const prevEsPub = normBio(row.bio_es);
  const prevEsDraft = normBio(row.bio_es_draft);

  const patch: Record<string, unknown> = { updated_at: now };
  let changed = false;

  if (enStatus === "approved") {
    if (nextEnDraft !== prevEnDraft) {
      patch.bio_en_draft = nextEnDraft || null;
      changed = true;
    }
  } else if (nextEnPub !== prevEnPub) {
    patch.bio_en = nextEnPub || null;
    patch.short_bio = nextEnPub || null;
    patch.bio_en_updated_at = now;
    patch.bio_en_status = nextEnPub ? "reviewed" : "missing";
    const esStale = nextBioEsStatusAfterEnglishChanged(esStatus, row.bio_es);
    if (esStale) {
      patch.bio_es_status = esStale;
    }
    changed = true;
  }

  if (esStatus === "approved") {
    if (nextEsDraft !== prevEsDraft) {
      patch.bio_es_draft = nextEsDraft || null;
      changed = true;
    }
  } else if (nextEsPub !== prevEsPub) {
    patch.bio_es = nextEsPub || null;
    patch.bio_es_status = nextEsPub ? "reviewed" : "missing";
    patch.bio_es_updated_at = now;
    const prevEnSt = (row.bio_en_status ?? "missing") as BioEsStatus;
    const enStale = nextBioEnStatusAfterSpanishChanged(prevEnSt, Boolean(prevEnPub));
    if (enStale) {
      patch.bio_en_status = enStale;
    }
    changed = true;
  }

  if (!changed) {
    return { error: null };
  }

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_quick_edit",
    actorId,
    actorKind: "user",
    eventType: "manual_edit_bilingual_quick",
    prevStatus: null,
    nextStatus: null,
    meta: {},
  });

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

  return { error: null };
}

/**
 * Translation Center quick edit: writes live English + Spanish bios only.
 * Ignores per-locale approval locks and draft buffers — staff “Save” updates the columns clients read from.
 */
export async function saveTalentBioTranslationCenterLive(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
  input: { bio_en: string; bio_es: string },
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const now = new Date().toISOString();
  const nextEn = normBio(input.bio_en);
  const nextEs = normBio(input.bio_es);
  const prevEn = normBio(canonicalBioEn(row.bio_en, row.short_bio));
  const prevEs = normBio(row.bio_es);

  if (nextEn === prevEn && nextEs === prevEs) {
    return { error: null };
  }

  const patch: Record<string, unknown> = {
    updated_at: now,
    bio_en: nextEn || null,
    short_bio: nextEn || null,
    bio_es: nextEs || null,
  };
  if (nextEn !== prevEn) {
    patch.bio_en_updated_at = now;
    patch.bio_en_status = nextEn ? "reviewed" : "missing";
  }
  if (nextEs !== prevEs) {
    patch.bio_es_updated_at = now;
    patch.bio_es_status = nextEs ? "reviewed" : "missing";
  }

  const { error } = await supabase.from("talent_profiles").update(patch).eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_translation_center",
    actorId,
    actorKind: "user",
    eventType: "manual_edit_bilingual_quick",
    prevStatus: null,
    nextStatus: null,
    meta: {},
  });

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

  return { error: null };
}

export async function approveEnglishBioDraft(
  supabase: SupabaseClient,
  talentProfileId: string,
  actorId: string,
): Promise<{ error: string | null }> {
  const { row, error: loadErr } = await loadTalentBioRow(supabase, talentProfileId);
  if (loadErr) return { error: loadErr };
  if (!row) return { error: "Profile not found." };

  const draft = normBio(row.bio_en_draft);
  if (!draft) return { error: "No English draft to publish." };

  const prevStatus = (row.bio_en_status ?? "missing") as BioEsStatus;
  const now = new Date().toISOString();

  const prevEsSt = (row.bio_es_status ?? "missing") as BioEsStatus;
  const markEsStale = nextBioEsStatusAfterEnglishChanged(prevEsSt, row.bio_es);

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_en: draft,
      short_bio: draft,
      bio_en_draft: null,
      bio_en_status: "approved",
      bio_en_updated_at: now,
      updated_at: now,
      ...(markEsStale ? { bio_es_status: markEsStale } : {}),
    })
    .eq("id", talentProfileId);
  if (error) return { error: error.message };

  await appendTranslationAudit(supabase, {
    entityType: "talent_profile",
    entityId: talentProfileId,
    fieldName: "bio_en",
    actorId,
    actorKind: "user",
    eventType: "approve_en_draft",
    prevStatus,
    nextStatus: "approved",
    meta: {},
  });

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

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

  const enCanon = normBio(canonicalBioEn(row.bio_en, row.short_bio));
  const prevEnSt = (row.bio_en_status ?? "missing") as BioEsStatus;
  const markEnStale = enCanon ? nextBioEnStatusAfterSpanishChanged(prevEnSt, true) : null;

  const { error } = await supabase
    .from("talent_profiles")
    .update({
      bio_es: draft,
      bio_es_draft: null,
      bio_es_status: "approved",
      bio_es_updated_at: now,
      updated_at: now,
      ...(markEnStale ? { bio_en_status: markEnStale } : {}),
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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

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

  await scheduleRebuildAiSearchDocument(supabase, talentProfileId);

  return { error: null };
}
