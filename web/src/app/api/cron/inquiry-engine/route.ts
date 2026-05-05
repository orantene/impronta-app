import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  processCoordinatorTimeouts,
  processExpirations,
  retryFailedEngineEffects,
} from "@/lib/inquiry/inquiry-engine";

/**
 * Scheduled job: coordinator timeouts, expirations, failed-effect retries.
 * Auth (audit H12): Authorization header bearer only — query-param token
 * was removed because it leaks via access logs.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const [timeouts, expirations, retries] = await Promise.all([
    processCoordinatorTimeouts(supabase),
    processExpirations(supabase),
    retryFailedEngineEffects(supabase),
  ]);

  return NextResponse.json({
    ok: true,
    timeouts,
    expirations,
    retries,
  });
}
