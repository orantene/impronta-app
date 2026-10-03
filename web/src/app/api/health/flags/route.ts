import { NextResponse } from "next/server";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { resolveProdGatingFlags } from "@/lib/health/prod-gating-flags";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { decideRebuildAuth } from "@/lib/talent-site/demos/rebuild-entry";

/**
 * GET /api/health/flags — live resolved production-gating feature flags.
 *
 * Auth: platform admin session OR `Authorization: Bearer $CRON_SECRET`
 * (same operator gate as `/api/platform/demos/*`). Unauthenticated callers
 * get 401; non-admin sessions get 403. Never flips flags; read-only.
 *
 * Reachability: `/api/health` is in SHARED_API_PREFIXES (host-agnostic).
 * Smoke: `cd web && npm run deploy:smoke` compares the payload to
 * `scripts/prod-flag-expectations.mjs` (keep in sync with FEATURES.md).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  let userId: string | null = null;
  let admin = false;
  if (!authorization) {
    const session = await getCachedActorSession();
    userId = session.user?.id ?? null;
    admin = !!session.user && isPlatformAdmin(session.profile);
  }
  const auth = decideRebuildAuth({
    secret: process.env.CRON_SECRET,
    authorization,
    userId,
    isAdmin: admin,
  });
  if (!auth.allow) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  const flags = await resolveProdGatingFlags();
  return NextResponse.json(
    {
      ok: true,
      via: auth.via,
      flags,
    },
    { headers: NO_STORE },
  );
}
