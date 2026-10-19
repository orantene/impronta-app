/**
 * GET /api/public/booking/catalog[?talent=<profile code>]
 *
 * TUL-21: one talent's public services as JSON, for AI assistants. On the
 * talent's own domain the host names the talent; on a shared host `talent`
 * does (published sites only). Same rows the storefront renders.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { contractsToMarkdown } from "@/lib/offerings/contract";
import { loadAgentContracts, loadAgentServices, resolveAgentSite } from "@/lib/booking/agent/agent-site.server";
import { AGENT_MCP_PATH, AGENT_SLOTS_PATH } from "@/lib/seo/talent-llms-txt";
import { checkBookingSlots } from "@/lib/rate-limit-kv";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await checkBookingSlots(resolvePublicClientIp(await headers()));
  if (!limited.ok) {
    const retryAfter = Math.max(1, Math.ceil((limited.retryAfterMs ?? 1000) / 1000));
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  try {
    const site = await resolveAgentSite(admin, request);
    if (!site) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const reqUrl = new URL(request.url);
    // F2: the same contracts, as markdown, for assistants that read text.
    if (reqUrl.searchParams.get("format") === "md" || (request.headers.get("accept") ?? "").includes("text/markdown")) {
      const contracts = await loadAgentContracts(site);
      return new NextResponse(contractsToMarkdown(site.name, contracts), {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "private, max-age=60" },
      });
    }
    const services = await loadAgentServices(site);
    const talentParam = reqUrl.searchParams.get("talent");
    const mcpQuery = site.host.kind === "talent_site" || !talentParam ? "" : `?talent=${encodeURIComponent(talentParam)}`;
    return NextResponse.json(
      {
        talent: site.name,
        page: `${site.origin}${site.basePath}`,
        services,
        open_times: `${site.origin}${AGENT_SLOTS_PATH}?offering=<service_id>&days=7`,
        mcp: `${site.origin}${AGENT_MCP_PATH}${mcpQuery}`,
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (err) {
    logServerError("api.public.booking.catalog", err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
