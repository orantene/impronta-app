/**
 * Cron — social token refresh sweep.
 *
 * Endpoint: GET /api/cron/refresh-social-tokens  (CRON_SECRET bearer auth)
 *
 * Keeps connected Instagram (60-day) and TikTok (~24h) tokens alive. See
 * ./logic.ts for why this is load-bearing rather than a nicety. Idempotent.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/refresh-social-tokens
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { sweepSocialTokens } from "./logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/refresh-social-tokens", "CRON_SECRET not set; refusing to run");
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
    const result = await sweepSocialTokens(admin);
    void improntaLog("cron.refresh_social_tokens", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logServerError("cron/refresh-social-tokens", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
