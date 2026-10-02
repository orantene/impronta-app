// POST /api/cron/revalidate-talent-site   (CRON_SECRET bearer auth)
//   body { talentProfileId: uuid, profileCode: "TAL-..." }
//   → 200 { ok: true }
//
// A REAL REQUEST PATH for busting a talent's public page cache. Scripts and
// Builder Lab's demo pipeline write site rows outside a request scope, where
// `revalidateTag` / `revalidatePath` cannot run; they POST here instead, so a
// live demo shows its new version without waiting for cache expiry. Same
// bearer contract as the other /api/cron routes (shared, host-agnostic).

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { logServerError } from "@/lib/server/safe-error";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^TAL-[A-Z0-9]{3,24}$/;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logServerError("cron/revalidate-talent-site", "CRON_SECRET not set; refusing to run");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!sameSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { talentProfileId?: unknown; profileCode?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const id = typeof body.talentProfileId === "string" ? body.talentProfileId : "";
  const code = typeof body.profileCode === "string" ? body.profileCode : null;
  if (!UUID.test(id) || (code !== null && !CODE.test(code))) {
    return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  }
  bustTalentSiteCache(id, code);
  return NextResponse.json({ ok: true });
}
