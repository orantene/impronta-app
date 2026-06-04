import { NextResponse } from "next/server";

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
 * NO secret values are exposed — only the boolean presence of the vars.
 * The route is intentionally unauthenticated so the post-deploy smoke test
 * can probe it without a session.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const hasUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  const active = hasUrl && hasToken;

  return NextResponse.json(
    { rateLimitFloor: active ? "active" : "disabled" },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
