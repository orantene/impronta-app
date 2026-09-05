/**
 * Keep the routes a stranger hits first out of a cold start.
 *
 * Endpoint: GET /api/cron/warm-front-door  (CRON_SECRET bearer auth)
 *
 * MEASURED, NOT ASSUMED. /support is ~350 ms warm and 3.6 to 4.2 seconds cold,
 * across cache-busted samples taken from two machines. It is a low-traffic
 * route on a serverless function, so it is cold for most first visits: the
 * owner's phone gets the cold number nearly every time he opens it, which is
 * what "slow, terrible" was.
 *
 * WHAT THIS IS NOT. It does not fix the cause. The cold cost is dominated by
 * `src/i18n/messages.ts`, which statically imports all three message catalogues
 * (1.4 MB of JSON, 12,519 keys per locale) and is deliberately synchronous
 * because 135 modules depend on that. Loading one locale instead of three is a
 * platform refactor and is owned as its own program. This is a warmer: it moves
 * the cold start off the visitor and onto a schedule, and it should be deleted
 * the day the real fix lands.
 *
 * WHY THESE TWO PATHS. `/support` is the page, and the guest chat API is the
 * first thing the panel calls; a warm page in front of a cold API just moves
 * the wait. Everything else a guest reaches goes through routes with enough
 * traffic to stay warm on their own.
 *
 * Deliberately cheap and quiet: a HEAD-like GET per path, a short timeout, no
 * retries, and failures are logged rather than thrown. A warmer that pages
 * somebody at 4am is worse than a cold start.
 */
import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/auth-flow";
import { improntaLog } from "@/lib/server/structured-log";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paths a stranger reaches before anything else. Keep this list short. */
const WARM_PATHS = ["/support", "/api/ai/guest-support-chat"] as const;

/** A warm request should be fast; a slow one has already lost the race. */
const TIMEOUT_MS = 8000;

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? getAppUrl()).replace(/\/$/, "");
}

async function warm(url: string): Promise<{ path: string; status: number | null; ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // The chat API answers a bare GET with a 4xx; that is fine and still warms
    // the function, which is the whole point. We record the status rather than
    // treating a non-200 as failure.
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "tulala-warmer" },
    });
    return { path: url, status: res.status, ms: Date.now() - started };
  } catch (err) {
    logServerError("cron/warm-front-door", err);
    return { path: url, status: null, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/warm-front-door", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = siteBase();
  const results = await Promise.all(WARM_PATHS.map((p) => warm(`${base}${p}`)));

  // Logged so the warmer's own effect is observable: if these durations start
  // reading like cold starts, the schedule is too slow or the paths changed.
  void improntaLog("cron.warm_front_door", {
    results: results.map((r) => `${r.path}:${r.status ?? "err"}:${r.ms}ms`).join(" "),
  });

  return NextResponse.json({ ok: true, warmed: results });
}
