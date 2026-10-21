import { NextResponse } from "next/server";

import { failOpenCount } from "@/lib/rate-limit-fail-open";
import { isDeployedEnv, probeLimiterStore } from "@/lib/rate-limit-public-floor";

/**
 * Diagnostics endpoint for the guest-chat anti-spam rate-limit floor.
 *
 * Returns a single boolean signal:
 *   { rateLimitFloor: "active" }   — both UPSTASH_REDIS_REST_URL and
 *                                    UPSTASH_REDIS_REST_TOKEN are present in
 *                                    the DEPLOYED runtime environment.
 *   { rateLimitFloor: "disabled" } — one or both vars are absent; the
 *                                    cross-instance KV hard ceiling is a no-op.
 *
 * TUL-1342 adds `store` ("ok" | "error" | "unset": the runtime can actually reach Upstash, a ping, not
 * just "the vars exist"), `publicLimiter` ("shared" | "fail_closed" | "per_instance": how the public catalog
 * and booking-slots limiters behave right now) and this instance's fail-open count. A deployed env with
 * a dead store used to report "active" while every public limiter failed open.
 *
 * NO secret values are exposed — only the boolean presence of the vars.
 * The route is intentionally unauthenticated so the post-deploy smoke test
 * can probe it without a session.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const hasUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  const active = hasUrl && hasToken;

  const store = await probeLimiterStore();
  const publicLimiter = store === "ok" ? "shared" : isDeployedEnv() ? (store === "unset" ? "fail_closed" : "per_instance") : "per_instance";

  return NextResponse.json(
    { rateLimitFloor: active ? "active" : "disabled", store, publicLimiter, failOpenCount: failOpenCount() },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
