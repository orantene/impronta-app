"use server";

/**
 * Talent site history: server actions for the builder (timeline, restore,
 * undo one theme update, "What will go live"). Owner-gated through the shared
 * site-action gate; writes go through the service role scoped to the gated
 * talent's own site (never an id from input).
 */
import { getRequestLocale } from "@/i18n/request-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { RevisionsLoadResult } from "@/lib/site-admin/edit-mode/revisions-actions";
import { gate } from "@/lib/talent-site/server/site-action-gate";

import { CONFLICT_COPY, pick } from "./copy";
import {
  loadGoLiveSummary,
  loadTalentTimeline,
  restoreHistoryEntry,
  undoThemeUpdateEntry,
  type GoLiveSummary,
  type HistoryWriteResult,
} from "./history.server";

export type TalentHistoryWriteResult =
  | { ok: true; draftRev: number }
  | { ok: false; code: string; error: string; currentRev?: number | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function localized(res: HistoryWriteResult): Promise<TalentHistoryWriteResult> {
  if (res.ok) return { ok: true, draftRev: res.draftRev };
  if (res.code === "conflict") {
    const locale = await getRequestLocale();
    return {
      ok: false,
      code: "VERSION_CONFLICT",
      error: pick(CONFLICT_COPY, locale),
      currentRev: res.currentRev,
    };
  }
  return { ok: false, code: res.code, error: res.error };
}

export async function loadTalentHistoryAction(input: {
  pageSlug?: string | null;
}): Promise<RevisionsLoadResult> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, error: g.error, code: "UNAUTHORIZED" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  return loadTalentTimeline(admin, g.talentProfileId, { pageSlug: input.pageSlug ?? null });
}

export async function restoreTalentHistoryAction(input: {
  entryId: string;
  expectedDraftRev: number | null;
}): Promise<TalentHistoryWriteResult> {
  if (!UUID_RE.test(input.entryId)) return { ok: false, code: "invalid_input", error: "Unknown version." };
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  return localized(
    await restoreHistoryEntry(admin, {
      talentProfileId: g.talentProfileId,
      entryId: input.entryId,
      expectedDraftRev: input.expectedDraftRev,
      actorId: g.userId,
    }),
  );
}

export async function undoTalentThemeUpdateAction(input: {
  entryId: string;
  expectedDraftRev: number | null;
}): Promise<TalentHistoryWriteResult> {
  if (!UUID_RE.test(input.entryId)) return { ok: false, code: "invalid_input", error: "Unknown update." };
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  return localized(
    await undoThemeUpdateEntry(admin, {
      talentProfileId: g.talentProfileId,
      entryId: input.entryId,
      expectedDraftRev: input.expectedDraftRev,
      actorId: g.userId,
    }),
  );
}

export async function loadTalentGoLiveAction(): Promise<
  { ok: true; summary: GoLiveSummary } | { ok: false; error: string }
> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, error: g.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Not configured." };
  const locale = (await getRequestLocale()).toLowerCase().startsWith("es") ? "es" : "en";
  const summary = await loadGoLiveSummary(admin, g.talentProfileId, locale);
  if (!summary) return { ok: false, error: "Site not found." };
  return { ok: true, summary };
}
