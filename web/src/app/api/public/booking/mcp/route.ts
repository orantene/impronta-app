/**
 * POST /api/public/booking/mcp[?talent=<profile code>]
 *
 * TUL-21: MCP server (streamable HTTP, stateless, JSON responses) for one
 * talent's booking site. Tools and the JSON-RPC rules live in
 * `@/lib/booking/agent/mcp`; this route only resolves the talent and the
 * limits. A notification gets 202 with no body; GET has no stream (405).
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { agentToolDeps, resolveAgentSite } from "@/lib/booking/agent/agent-site.server";
import { handleMcpMessage, parseMcpBody } from "@/lib/booking/agent/mcp";
import { checkBookingSlots } from "@/lib/rate-limit-kv";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 64 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

function rpcFailure(status: number, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const limited = await checkBookingSlots(resolvePublicClientIp(await headers()));
  if (!limited.ok) {
    const retryAfter = Math.max(1, Math.ceil((limited.retryAfterMs ?? 1000) / 1000));
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limited." } },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
    );
  }

  const raw = await request.text();
  if (raw.length > BODY_MAX_BYTES) return rpcFailure(413, -32600, "Request too large.");
  const parsed = parseMcpBody(raw);
  if (!parsed.ok) return NextResponse.json(parsed.response, { status: 400, headers: NO_STORE });

  const admin = createServiceRoleClient();
  if (!admin) return rpcFailure(503, -32603, "Service unavailable.");

  try {
    const site = await resolveAgentSite(admin, request);
    if (!site) return rpcFailure(404, -32001, "No bookable talent on this address.");
    const response = await handleMcpMessage(parsed.message, agentToolDeps(admin, site));
    if (!response) return new NextResponse(null, { status: 202, headers: NO_STORE });
    return NextResponse.json(response, { headers: NO_STORE });
  } catch (err) {
    logServerError("api.public.booking.mcp", err);
    return rpcFailure(500, -32603, "Internal error.");
  }
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
