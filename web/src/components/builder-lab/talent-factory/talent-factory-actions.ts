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
