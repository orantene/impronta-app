// POST /api/platform/demos/restore   body DemoRestoreRequest -> { ok, error? }
// Same auth as /rebuild. Reachability: `/api/platform/demos` in SHARED_API_PREFIXES.
import { NextResponse } from "next/server";

import { restoreDemoRun } from "@/lib/talent-site/demos/demo-rebuild.server";
import { parseRestoreBody, restoreOutcome } from "@/lib/talent-site/demos/rebuild-entry";
import { runDemoRoute } from "@/lib/talent-site/demos/rebuild-route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return runDemoRoute(request, "platform/demos/restore", async (admin, raw) => {
    const parsed = parseRestoreBody(raw);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
    const result = restoreOutcome(await restoreDemoRun(admin, parsed.data.runId));
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  });
}
