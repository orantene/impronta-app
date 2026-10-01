// POST /api/platform/demos/rebuild   body DemoRebuildRequest -> DemoRebuildResult
// Auth: signed-in platform admin OR `Authorization: Bearer $CRON_SECRET`.
// Reachability: `/api/platform/demos` is in SHARED_API_PREFIXES (path-groups.ts).
import { NextResponse } from "next/server";

import { rebuildDemos } from "@/lib/talent-site/demos/demo-rebuild.server";
import { parseRebuildBody } from "@/lib/talent-site/demos/rebuild-entry";
import { runDemoRoute } from "@/lib/talent-site/demos/rebuild-route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  return runDemoRoute(request, "platform/demos/rebuild", async (admin, raw, auth) => {
    const parsed = parseRebuildBody(raw);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
    const result = await rebuildDemos(admin, parsed.data, auth.actorId);
    return NextResponse.json(result);
  });
}
