"use server";

import { revalidatePath } from "next/cache";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { updateReleaseNotes } from "@/lib/talent-site/theme-releases/releases.server";
import type { ReleaseChannel, ThemeRelease } from "@/lib/talent-site/theme-releases/types";
import { editItemInList, type ItemEdit } from "@/lib/talent-site/theme-releases/manager/items";
import {
  changeChannel,
  changeRollout,
  loadRelease,
  runDryRun,
} from "@/lib/talent-site/theme-releases/manager/release-manager.server";
import type { DryRunReport } from "@/lib/talent-site/theme-releases/manager/dry-run";

const BASE = "/platform/admin/builder-lab/themes";
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function gate(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Super admin access required." };
  return { ok: true, userId: session.user.id };
}

async function withRelease<T>(
  releaseId: string,
  run: (
    admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
    release: ThemeRelease,
  ) => Promise<Result<T>>,
): Promise<Result<T>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const release = await loadRelease(admin, releaseId);
  if (!release) return { ok: false, error: "Release not found." };
  let res: Result<T>;
  try {
    res = await run(admin, release);
  } catch (err) {
    logServerError("themeReleaseManager.action", err);
    res = { ok: false, error: err instanceof Error ? err.message : "Action failed." };
  }
  revalidatePath(`${BASE}/${releaseId}`);
  revalidatePath(BASE);
  return res;
}

/** Edit items by id (type, EN/ES note, screenshot URL, critical) and the release notes. */
export async function actionSaveRelease(
  releaseId: string,
  input: { itemEdits: Array<{ id: string } & ItemEdit>; notesEn?: string; notesEs?: string },
): Promise<Result> {
  return withRelease(releaseId, async (admin, release) => {
    if (release.status === "archived") return { ok: false, error: "This release is archived." };
    let items = release.items ?? [];
    for (const e of input.itemEdits.slice(0, 500)) {
      const { id, ...edit } = e;
      items = editItemInList(items, id, edit);
    }
    const notes = {
      ...release.notes,
      ...(input.notesEn !== undefined ? { en: input.notesEn.trim().slice(0, 2000) } : {}),
      ...(input.notesEs !== undefined ? { es: input.notesEs.trim().slice(0, 2000) } : {}),
    };
    const res = await updateReleaseNotes(admin, releaseId, { notes, items });
    return res.ok ? { ok: true, data: null } : { ok: false, error: res.error };
  });
}

/** READ-ONLY merge of the release into every site on the design. */
export async function actionRunDryRun(releaseId: string): Promise<Result<DryRunReport>> {
  return withRelease(releaseId, async (admin, release) => {
    const res = await runDryRun(admin, release);
    return res.ok ? { ok: true, data: res.report } : res;
  });
}

/** Publish to demos / Open to talents / Make default. Refused without a fresh dry run. */
export async function actionChangeChannel(
  releaseId: string,
  target: ReleaseChannel,
): Promise<Result<{ channel: ReleaseChannel; demosApplied: number; updates: number; bells: number; warnings: string[] }>> {
  return withRelease(releaseId, async (admin, release) => {
    if (target !== "demos" && target !== "optin" && target !== "default") {
      return { ok: false, error: "Unknown channel." };
    }
    const res = await changeChannel(admin, release, target);
    return res.ok ? { ok: true, data: res } : res;
  });
}

export async function actionSetRollout(releaseId: string, pct: number): Promise<Result<{ updates: number; bells: number }>> {
  return withRelease(releaseId, async (admin, release) => {
    const res = await changeRollout(admin, release, pct);
    return res.ok ? { ok: true, data: { updates: res.updates, bells: res.bells } } : res;
  });
}

/** Instant pause / resume (status only; talents stop seeing it, nothing is undone). */
export async function actionSetPaused(releaseId: string, paused: boolean): Promise<Result> {
  return withRelease(releaseId, async (admin, release) => {
    if (release.status === "archived") return { ok: false, error: "This release is archived." };
    const { error } = await admin
      .from("talent_theme_releases")
      .update({
        status: paused ? "paused" : release.channel === "optin" || release.channel === "default" ? "published" : "draft",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", releaseId);
    return error ? { ok: false, error: error.message } : { ok: true, data: null };
  });
}
