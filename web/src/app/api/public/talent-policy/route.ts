/**
 * GET /api/public/talent-policy?talent=<profile id>&doc=booking|privacy&locale=es|en
 *
 * Unauthenticated. The policy sheet over the booking reads the same model the
 * public page renders: the latest published version, or the neutral default.
 * Only text the talent already published (or platform default text) leaves here.
 */

import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadPolicyPage, type PolicyDoc } from "@/lib/talent-policies/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE = "public, s-maxage=30, stale-while-revalidate=60";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const talent = url.searchParams.get("talent") ?? "";
  const docParam = url.searchParams.get("doc");
  const doc: PolicyDoc = docParam === "privacy" ? "privacy" : "booking";
  if (!UUID_RE.test(talent)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const model = await loadPolicyPage(admin, { talentProfileId: talent, doc, locale: url.searchParams.get("locale") });
  return NextResponse.json({ model }, { headers: { "Cache-Control": CACHE } });
}
