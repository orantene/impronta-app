/**
 * GET /llms.txt — TUL-21. Only on a talent's own domain (the talent-site
 * allow-list passes it; every other host kind 404s at the surface gate).
 */

import { NextResponse } from "next/server";

import { loadAgentServices, resolveAgentSite } from "@/lib/booking/agent/agent-site.server";
import { buildTalentLlmsTxt } from "@/lib/booking/agent/llms-txt";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new NextResponse("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(request: Request) {
  const host = await getPublicHostContext();
  if (host.kind !== "talent_site") return notFound();
  const admin = createServiceRoleClient();
  if (!admin) return new NextResponse("Unavailable\n", { status: 503 });
  try {
    const site = await resolveAgentSite(admin, request);
    if (!site) return notFound();
    const [services, switches] = await Promise.all([
      loadAgentServices(site),
      loadTalentSiteSwitches(admin, site.talentProfileId),
    ]);
    const body = buildTalentLlmsTxt({
      origin: site.origin,
      name: site.name,
      services,
      agentBookingEnabled: switches.chatConfig.agentBookingEnabled,
    });
    return new NextResponse(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    logServerError("llms.txt", err);
    return new NextResponse("Unavailable\n", { status: 503 });
  }
}
