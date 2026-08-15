/**
 * Cron — social feed cache refresh.
 *
 * Endpoint: GET /api/cron/refresh-social-feeds  (CRON_SECRET bearer auth)
 *
 * Pulls recent media for every connected Instagram/TikTok account into
 * tenant_social_feed_items. Public storefront pages read ONLY from that cache,
 * so this job is what makes "latest posts" true without putting a third-party
 * API in the render path. Idempotent.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/refresh-social-feeds
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { sweepSocialFeeds } from "@/lib/social-embed/feed-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/refresh-social-feeds", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 503 });
  }

  try {
    const result = await sweepSocialFeeds(admin);
    void improntaLog("cron.refresh_social_feeds", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/refresh-social-feeds", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
