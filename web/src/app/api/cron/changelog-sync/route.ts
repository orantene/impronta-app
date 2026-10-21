/**
 * Cron + webhook: Notion Releases → public.changelog_entries (TUL-1390).
 *
 * Auth (either):
 *   Authorization: Bearer $CRON_SECRET            (Vercel cron, every 15 min)
 *   x-changelog-sync-secret: $CHANGELOG_SYNC_SECRET  (Notion "Publish now" button)
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "http://localhost:3000/api/cron/changelog-sync"
 *   add ?force=1 to re-render every entry.
 *
 * Soft-skips when Notion env is missing. Notion is read-only here.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { DEFAULT_RELEASES_DATABASE_ID, syncChangelog } from "@/lib/changelog/sync";
import { isAuthorizedSyncRequest } from "@/lib/changelog/sync-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.CHANGELOG_SYNC_SECRET;
  if (!cronSecret && !syncSecret) {
    logServerError("cron/changelog-sync", "no sync secret configured; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!isAuthorizedSyncRequest((name) => request.headers.get(name), { cronSecret, syncSecret })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.NOTION_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: true, skipped: true, reason: "notion_env_missing", missing: ["NOTION_API_KEY"] });
  }
  const databaseId = process.env.NOTION_RELEASES_DATABASE_ID?.trim() || DEFAULT_RELEASES_DATABASE_ID;

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });

  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    const result = await syncChangelog({ admin, apiKey, databaseId, force });
    if (result.errors.length > 0) logServerError("cron/changelog-sync.entries", result.errors.join(" | "));
    return NextResponse.json({ ok: result.errors.length === 0, ...result, errors: result.errors.length });
  } catch (err) {
    logServerError("cron/changelog-sync", err);
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}

export const GET = handle;
// The Notion button sends a POST.
export const POST = handle;
