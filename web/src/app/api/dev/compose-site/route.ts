/**
 * POST /api/dev/compose-site — run `composeSiteFromBrief` against a TEST
 * tenant for local QA and the acceptance harness (Templates & Imagery).
 *
 * Dev/preview only (same gate as /api/dev/signin) AND the caller must be a
 * signed-in staff member of the target workspace. Optionally seeds a brief
 * with the given facts first, so the fixtures in docs/plans/templates/01-plan
 * §5 (home cleaner, nail salon, El Paisa) can be exercised without a signup.
 *
 * Body: { tenantSlug, lookId?, locale?, publish?, overwrite?, facts?: [{factKey, value}] }
 */

import { NextResponse, type NextRequest } from "next/server";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { composeSiteFromBrief } from "@/lib/site-admin/builder-core/site-templates/compose-site-from-brief.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ensureBrief, recordFacts } from "@/lib/tulala/brief-store.server";
import { loadBriefForTenant } from "@/lib/tulala/brief-store-tenant.server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isDev && !isPreview) return new NextResponse("Not available in production.", { status: 403 });

  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as null | {
    tenantSlug?: string;
    lookId?: string;
    locale?: "es" | "en";
    publish?: boolean;
    overwrite?: boolean;
    facts?: Array<{ factKey: string; value: unknown }>;
    /** Wipe the tenant brief's facts before recording `facts` (acceptance runs reuse one QA tenant). */
    resetFacts?: boolean;
  };
  if (!body?.tenantSlug) return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service role unavailable" }, { status: 500 });
  const { data: agency, error } = await admin.from("agencies").select("id, slug").eq("slug", body.tenantSlug).maybeSingle<{ id: string; slug: string }>();
  if (error || !agency) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  // Staff of THAT workspace only: a dev route must not compose a site the
  // caller does not belong to.
  const { data: membership, error: memErr } = await admin.from("agency_memberships").select("id").eq("tenant_id", agency.id).eq("profile_id", session.user.id).limit(1);
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  if (!membership || membership.length === 0) return NextResponse.json({ error: "not a member of that workspace" }, { status: 403 });

  if (body.facts && body.facts.length > 0) {
    const existing = await loadBriefForTenant({ tenantId: agency.id });
    let briefId = existing?.id ?? null;
    if (briefId && body.resetFacts) await admin.from("tulala_brief_facts").delete().eq("brief_id", briefId);
    if (!briefId) {
      const ensured = await ensureBrief({ kind: "profile", profileId: session.user.id }, { locale: body.locale ?? "es" });
      if (!ensured.ok) return NextResponse.json({ error: ensured.error }, { status: 500 });
      briefId = ensured.brief.id;
      await admin.from("tulala_briefs").update({ tenant_id: agency.id }).eq("id", briefId);
    }
    await recordFacts(
      briefId,
      body.facts.map((f) => ({ factKey: f.factKey, value: f.value, source: "user_stated" as const, status: "confirmed" as const, confidence: 1 })),
    );
  }

  const result = await composeSiteFromBrief({
    tenantId: agency.id,
    lookId: body.lookId ?? null,
    locale: body.locale,
    actorProfileId: session.user.id,
    publish: body.publish ?? true,
    overwrite: body.overwrite ?? true,
  });
  return NextResponse.json(result);
}

/** GET ?ids=a,b,c → cost per site_compose_id from cms_ai_usage_log (dev only). */
export async function GET(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isDev && !isPreview) return new NextResponse("Not available in production.", { status: 403 });
  const session = await getCachedActorSession();
  if (!session.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service role unavailable" }, { status: 500 });
  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
  const out: Record<string, { calls: number; failed: number; costUsd: number }> = {};
  for (const id of ids) {
    const { data, error } = await admin.from("cms_ai_usage_log").select("ok, context_jsonb").contains("context_jsonb", { site_compose_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as Array<{ ok: boolean; context_jsonb: { cost_usd?: number } | null }>;
    out[id] = { calls: rows.length, failed: rows.filter((r) => !r.ok).length, costUsd: rows.reduce((n, r) => n + Number(r.context_jsonb?.cost_usd ?? 0), 0) };
  }
  return NextResponse.json(out);
}
