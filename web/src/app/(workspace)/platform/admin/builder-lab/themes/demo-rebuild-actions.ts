"use server";

import { revalidatePath } from "next/cache";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { rebuildDemos, restoreDemoRun } from "@/lib/talent-site/demos/demo-rebuild.server";
import { restoreOutcome } from "@/lib/talent-site/demos/rebuild-entry";
import type { DemoDesign, DemoRebuildResult } from "@/lib/talent-site/demos/types";

const BASE = "/platform/admin/builder-lab/themes";
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

// Same gate as ./actions.ts (platform admin only).
async function gate(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Super admin access required." };
  return { ok: true, userId: session.user.id };
}

const DESIGNS: readonly string[] = ["maison-v2", "folio", "gridline"];

/** dryRun true reads and plans only; false rebuilds and publishes the design's demos. */
export async function actionRebuildDemos(design: string, dryRun: boolean): Promise<Result<DemoRebuildResult>> {
  const g = await gate();
  if (!g.ok) return g;
  if (!DESIGNS.includes(design)) return { ok: false, error: "Unknown design." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    const data = await rebuildDemos(admin, { design: design as DemoDesign, dryRun, publish: true }, g.userId);
    if (!dryRun) revalidatePath(BASE);
    return { ok: true, data };
  } catch (err) {
    logServerError("demoRebuild.action", err);
    return { ok: false, error: err instanceof Error ? err.message : "Action failed." };
  }
}

export async function actionRestoreDemoRun(runId: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return { ok: false, error: "Bad run id." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    const out = restoreOutcome(await restoreDemoRun(admin, runId));
    if (!out.ok) return { ok: false, error: out.error ?? "Restore failed." };
    revalidatePath(BASE);
    return { ok: true, data: null };
  } catch (err) {
    logServerError("demoRebuild.restore", err);
    return { ok: false, error: err instanceof Error ? err.message : "Restore failed." };
  }
}
