"use server";

/**
 * THEME RELEASES (Phase 4): server actions for the talent update notice.
 * Owner-gated through the shared site-action gate; every read and write is
 * scoped to the gated talent's own profile id (never an id from input beyond
 * the update row, which is re-checked against that profile).
 */
import { getRequestLocale } from "@/i18n/request-locale";
import { CONFLICT_COPY, pick } from "@/lib/talent-site/history/copy";
import { gate } from "@/lib/talent-site/server/site-action-gate";

import { applyCriticalFix } from "./critical-fix.server";
import {
  addThemeUpdateBlock,
  applyThemeUpdate,
  defaultUpdateDeps,
  dismissThemeUpdate,
  loadAvailableBlocks,
  loadTalentUpdateNotices,
  previewThemeUpdate,
  type AvailableBlocks,
  type ApplyOutcome,
  type TalentUpdateNotice,
  type UpdatePreview,
  type UpdateResult,
} from "./talent-update.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_RE = /^[\w:./\-*]{1,200}$/;
const NODE_ID_RE = /^[\w\-:.]{1,120}$/;

const BAD = { ok: false as const, code: "invalid_input", error: "Unknown update." };
const OFF = { ok: false as const, code: "server_error", error: "Not configured." };

async function localized<T>(res: UpdateResult<T>): Promise<UpdateResult<T>> {
  if (res.ok || res.code !== "VERSION_CONFLICT") return res;
  return { ...res, error: pick(CONFLICT_COPY, await getRequestLocale()) };
}

export async function loadThemeUpdateNoticesAction(): Promise<
  { ok: true; notices: TalentUpdateNotice[] } | { ok: false; error: string }
> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return { ok: false, error: OFF.error };
  return { ok: true, notices: await loadTalentUpdateNotices(deps.admin, g.talentProfileId) };
}

/** Read-only: the merge report + the preview link. Writes nothing. */
export async function previewThemeUpdateAction(input: { updateId: string }): Promise<UpdateResult<UpdatePreview>> {
  if (!UUID_RE.test(input.updateId)) return BAD;
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return OFF;
  return previewThemeUpdate(deps, g.talentProfileId, input.updateId);
}

export async function applyThemeUpdateAction(input: {
  updateId: string;
  expectedDraftRev: number | null;
}): Promise<UpdateResult<ApplyOutcome>> {
  if (!UUID_RE.test(input.updateId)) return BAD;
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return OFF;
  return localized(
    await applyThemeUpdate(deps, {
      talentProfileId: g.talentProfileId,
      updateId: input.updateId,
      expectedDraftRev: typeof input.expectedDraftRev === "number" ? input.expectedDraftRev : null,
      actorId: g.userId,
    }),
  );
}

/** F125: the important fix alone, for a site with no exact base. */
export async function applyCriticalFixAction(input: {
  updateId: string;
  expectedDraftRev: number | null;
}): Promise<UpdateResult<ApplyOutcome>> {
  if (!UUID_RE.test(input.updateId)) return BAD;
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return OFF;
  return localized(
    await applyCriticalFix(deps, {
      talentProfileId: g.talentProfileId,
      updateId: input.updateId,
      expectedDraftRev: typeof input.expectedDraftRev === "number" ? input.expectedDraftRev : null,
      actorId: g.userId,
    }),
  );
}

export async function dismissThemeUpdateAction(input: { updateId: string }): Promise<UpdateResult<null>> {
  if (!UUID_RE.test(input.updateId)) return BAD;
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return OFF;
  return dismissThemeUpdate(deps.admin, g.talentProfileId, input.updateId);
}

export async function addThemeUpdateBlockAction(input: {
  updateId: string;
  itemId: string;
  afterId: string | null;
  expectedDraftRev: number | null;
}): Promise<UpdateResult<{ draftRev: number }>> {
  if (!UUID_RE.test(input.updateId) || !ITEM_RE.test(input.itemId)) return BAD;
  if (input.afterId !== null && !NODE_ID_RE.test(input.afterId)) return BAD;
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, code: g.code, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return OFF;
  return localized(
    await addThemeUpdateBlock(deps, {
      talentProfileId: g.talentProfileId,
      updateId: input.updateId,
      itemId: input.itemId,
      afterId: input.afterId,
      expectedDraftRev: typeof input.expectedDraftRev === "number" ? input.expectedDraftRev : null,
      actorId: g.userId,
    }),
  );
}

/** Skipped new blocks from releases she is on or past; each can still be added. */
export async function loadAvailableBlocksAction(): Promise<{ ok: true; value: AvailableBlocks } | { ok: false; error: string }> {
  const g = await gate("personalSiteEdit");
  if (!g.ok) return { ok: false, error: g.error };
  const deps = defaultUpdateDeps();
  if (!deps) return { ok: false, error: OFF.error };
  return { ok: true, value: await loadAvailableBlocks(deps.admin, g.talentProfileId) };
}
