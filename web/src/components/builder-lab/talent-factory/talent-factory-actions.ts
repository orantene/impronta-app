"use server";

/**
 * Talent Template Factory server actions. TALENT designs only: the sync is
 * `syncBuiltinTalentThemes` (gated mode) and demo rebuilds go through the
 * existing `actionRebuildDemos`. The agency "Sync built-in starters" action is
 * never called from here. Every action is platform-admin gated first.
 */
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import type { FactoryOverview } from "./factory-model";
import { evaluateFactoryGate, guardedFactoryRun, type FactoryResult } from "./talent-factory-gate";
import { loadTalentFactory, syncTalentCatalog } from "./talent-factory.server";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import {
  exportAuthoredOverlayForGit,
  openCodeSeedReviewDraft,
} from "@/lib/talent-site/theme-catalog/code-seed-review.server";

export type TalentSyncJson = {
  created: number;
  updated: number;
  unchanged: number;
  heldBack: string[];
  skippedAuthored: Array<{ kind: string; slug: string }>;
  authoredPending: Array<{ slug: string; version: number }>;
  authoredConflict: Array<{ slug: string; version: number }>;
};

async function gate() {
  const session = await getCachedActorSession();
  return evaluateFactoryGate({ user: session.user, profile: session.profile });
}

export async function actionLoadTalentFactory(): Promise<FactoryResult<FactoryOverview>> {
  return guardedFactoryRun(await gate(), async () => {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    try {
      return { ok: true, data: await loadTalentFactory(admin) };
    } catch (err) {
      logServerError("talentFactory.load", err);
      return { ok: false, error: err instanceof Error ? err.message : "Load failed." };
    }
  });
}

export async function actionSyncTalentCatalog(): Promise<FactoryResult<TalentSyncJson>> {
  await requireNotImpersonating();
  return guardedFactoryRun(await gate(), async () => {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    try {
      const res = await syncTalentCatalog(admin);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        data: {
          created: res.created,
          updated: res.updated,
          unchanged: res.unchanged,
          heldBack: res.heldBack ?? [],
          skippedAuthored: res.skippedAuthored,
          authoredPending: res.authoredPending,
          authoredConflict: res.authoredConflict,
        },
      };
    } catch (err) {
      logServerError("talentFactory.sync", err);
      return { ok: false, error: err instanceof Error ? err.message : "Sync failed." };
    }
  });
}

export type CodeSeedReviewJson = {
  design: string;
  kind: string;
  summary: string;
  summaryEs: string;
  editHref: string;
  alreadyDone: boolean;
};

/** TUL-366: open a Builder Lab draft with code-seed changes (no publish). */
export async function actionOpenCodeSeedReview(design: string): Promise<FactoryResult<CodeSeedReviewJson>> {
  await requireNotImpersonating();
  return guardedFactoryRun(await gate(), async (userId) => {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    try {
      const res = await openCodeSeedReviewDraft(admin, design.trim().toLowerCase(), userId);
      if (!res.ok) return { ok: false, error: res.errorEs ?? res.error };
      return {
        ok: true,
        data: {
          design: res.design,
          kind: res.kind,
          summary: res.summary,
          summaryEs: res.summaryEs,
          editHref: res.editHref,
          alreadyDone: res.alreadyDone,
        },
      };
    } catch (err) {
      logServerError("talentFactory.codeSeedReview", err);
      return { ok: false, error: err instanceof Error ? err.message : "Code-seed review failed." };
    }
  });
}

export type AuthoredOverlayExportJson = {
  file: string;
  overlayJson: string;
  authoredVersion: number;
};

/** TUL-366: export authored overlay JSON for git after a Builder Lab publish. */
export async function actionExportAuthoredOverlay(
  design: string,
): Promise<FactoryResult<AuthoredOverlayExportJson>> {
  await requireNotImpersonating();
  return guardedFactoryRun(await gate(), async () => {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    try {
      const res = await exportAuthoredOverlayForGit(admin, design.trim().toLowerCase());
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        data: { file: res.file, overlayJson: res.overlayJson, authoredVersion: res.authoredVersion },
      };
    } catch (err) {
      logServerError("talentFactory.exportOverlay", err);
      return { ok: false, error: err instanceof Error ? err.message : "Export failed." };
    }
  });
}
