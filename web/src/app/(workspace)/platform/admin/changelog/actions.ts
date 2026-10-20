"use server";

/**
 * TUL-1391: "Sync changelog now" in Platform Admin.
 *
 * Runs the same sync as /api/cron/changelog-sync (PR #4154) by calling its
 * function directly on the server, so no secret ever has to be built into a
 * browser request: the browser only submits a form. The shared secret
 * (CHANGELOG_SYNC_SECRET) stays on the server and is used only by the Notion
 * "Publish now" button, which sends it in the x-changelog-sync-secret header.
 * super_admin only, never while impersonating.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPlatformRole } from "@/lib/access/platform-role";
import { DEFAULT_RELEASES_DATABASE_ID, syncChangelog } from "@/lib/changelog/sync";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const BASE = "/platform/admin/changelog";

export async function syncChangelogNowAction(formData: FormData): Promise<void> {
  void formData;
  await requireNotImpersonating();
  const session = await getCachedActorSession();
  if (!session.user || getPlatformRole(session.profile) !== "super_admin") {
    redirect(`${BASE}?result=forbidden`);
  }

  const apiKey = process.env.NOTION_API_KEY?.trim();
  if (!apiKey) redirect(`${BASE}?result=no_notion`);
  const admin = createServiceRoleClient();
  if (!admin) redirect(`${BASE}?result=no_db`);

  const databaseId = process.env.NOTION_RELEASES_DATABASE_ID?.trim() || DEFAULT_RELEASES_DATABASE_ID;
  let query: string;
  try {
    const r = await syncChangelog({ admin, apiKey, databaseId, force: false });
    if (r.errors.length > 0) logServerError("platform.changelog.sync.entries", r.errors.join(" | "));
    query = `result=${r.errors.length === 0 ? "ok" : "partial"}&synced=${r.synced}&removed=${r.removed}&errors=${r.errors.length}`;
  } catch (err) {
    logServerError("platform.changelog.sync", err);
    query = "result=failed";
  }
  revalidatePath(BASE);
  redirect(`${BASE}?${query}`);
}
