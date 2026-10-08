"use server";

/**
 * TEMPLATE FACTORY: "Publish as vN+1" server actions (talent design editor).
 * Platform-admin gated with the same `gate()` as the release manager actions.
 * A successful publish returns `releaseId` + `href` so the editor redirects to
 * the release page (/platform/admin/builder-lab/themes/<releaseId>).
 */
import { revalidatePath } from "next/cache";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { DryRunReport } from "@/lib/talent-site/theme-releases/manager/dry-run";
import type { ReleaseItem } from "@/lib/talent-site/theme-releases/types";
import {
  previewThemeDraftPublish,
  publishAndUpdateDemos,
  publishThemeDraft,
} from "@/lib/talent-site/theme-template/publish.server";
import type { ThemeDraftPublishPreview } from "@/lib/talent-site/theme-template/types";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

const RELEASES = "/platform/admin/builder-lab/themes";

type Fail = { ok: false; code?: string; error: string; errorEs?: string; issues?: string[]; releaseId?: string; href?: string; report?: DryRunReport };
type Result<T> = { ok: true; data: T } | Fail;

async function gate(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false, error: "Super admin access required." };
  return { ok: true, userId: session.user.id };
}

function cleanSlug(v: unknown): string | null {
  return typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v) ? v : null;
}

function cleanRev(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

const releaseHref = (id: string) => `${RELEASES}/${encodeURIComponent(id)}`;

async function withAdmin<T>(
  run: (admin: NonNullable<ReturnType<typeof createServiceRoleClient>>, userId: string) => Promise<Result<T>>,
): Promise<Result<T>> {
  const g = await gate();
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    return await run(admin, g.userId);
  } catch (err) {
    logServerError("themeTemplate.publishAction", err);
    return { ok: false, error: err instanceof Error ? err.message : "Action failed." };
  }
}

export async function actionPreviewDesignPublish(
  design: string,
): Promise<Result<ThemeDraftPublishPreview & { items: ReleaseItem[] }>> {
  const slug = cleanSlug(design);
  if (!slug) return { ok: false, error: "Unknown design." };
  return withAdmin(async (admin) => {
    const r = await previewThemeDraftPublish(admin, slug);
    return r.ok ? { ok: true, data: r.value } : r;
  });
}

export async function actionPublishDesign(
  design: string,
  expectedRev: number,
): Promise<Result<{ version: number; releaseId: string; href: string }>> {
  await requireNotImpersonating();
  const slug = cleanSlug(design);
  const rev = cleanRev(expectedRev);
  if (!slug || rev === null) return { ok: false, error: "Unknown design or draft revision." };
  return withAdmin(async (admin, userId) => {
    const r = await publishThemeDraft(admin, { design: slug, expectedRev: rev, actorId: userId });
    if (!r.ok) return r;
    revalidatePath(RELEASES);
    return { ok: true, data: { ...r.value, href: releaseHref(r.value.releaseId) } };
  });
}

export async function actionPublishDesignAndUpdateDemos(
  design: string,
  expectedRev: number,
): Promise<Result<{ version: number; releaseId: string; href: string; demosApplied: number; warnings: string[] }>> {
  await requireNotImpersonating();
  const slug = cleanSlug(design);
  const rev = cleanRev(expectedRev);
  if (!slug || rev === null) return { ok: false, error: "Unknown design or draft revision." };
  return withAdmin(async (admin, userId) => {
    const r = await publishAndUpdateDemos(admin, { design: slug, expectedRev: rev, actorId: userId });
    revalidatePath(RELEASES);
    if (!r.ok) {
      if (r.releaseId) revalidatePath(releaseHref(r.releaseId));
      return { ...r, ...(r.releaseId ? { href: releaseHref(r.releaseId) } : {}) };
    }
    revalidatePath(releaseHref(r.value.releaseId));
    const { version, releaseId, demosApplied, warnings } = r.value;
    return { ok: true, data: { version, releaseId, demosApplied, warnings, href: releaseHref(releaseId) } };
  });
}
