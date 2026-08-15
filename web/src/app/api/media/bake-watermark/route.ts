// /api/media/bake-watermark — server-side logo compositing via sharp.
//
// POST { mediaAssetId: string }
//
// THIN WRAPPER. The pipeline itself lives in `@/lib/media/watermark-bake`
// because phase 4 of the media-ownership plan bakes from a server action too
// (watermark-on-release), and two copies of "where does the logo go, which
// bucket, what row shape" is how two readers end up disagreeing.
//
// Not suitable for bulk use — call with a concurrency limit upstream.

import { NextRequest, NextResponse } from "next/server";

import { bakeWatermarkedVariant } from "@/lib/media/watermark-bake";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  let mediaAssetId: string;
  let repair = false;
  try {
    const body = (await req.json()) as { mediaAssetId?: unknown; repair?: unknown };
    if (typeof body.mediaAssetId !== "string") throw new Error("bad input");
    mediaAssetId = body.mediaAssetId;
    repair = body.repair === true;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const result = await bakeWatermarkedVariant(auth.supabase, {
    assetId: mediaAssetId,
    tenantId: auth.tenantId,
    actorUserId: auth.user?.id ?? null,
    // A manual bake still respects "watermark off" — the operator asked for a
    // preview of a feature they may not have turned on. The release path
    // passes false, because ticking "require watermark" IS the enable.
    //
    // `repair: true` is the exception (A4). This route is the only way to
    // rebuild a derivative that a release approval failed to bake, and the
    // approval path itself passes `requirePresetEnabled: false` — so with the
    // default the route refused EXACTLY the disabled-preset case it exists to
    // repair. Staff auth is already required above; opting in explicitly keeps
    // the "preview" default honest while making the repair reachable.
    requirePresetEnabled: !repair,
  });

  // Errors here are configuration or source problems, not server faults; the
  // caller reads `ok` either way. Status stays 200 for parity with the
  // original route so any future client keeps working.
  return NextResponse.json(result);
}
