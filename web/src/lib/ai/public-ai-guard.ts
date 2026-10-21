/**
 * TUL-1630 · The one guard every anonymous AI route calls FIRST (after its cheap flag checks, before it reads the body or
 * touches a model): identify the network, then apply the per-IP limit. An unidentifiable network is refused, a limiter
 * that errors refuses (fail closed). Returns the response to send, or null to carry on.
 */
import { NextResponse } from "next/server";
import { resolveClientIp } from "@/lib/guest/guest-session";
import { checkPublicAiByIp, type PublicAiRoute } from "@/lib/rate-limit-kv-public-ai";

export async function guardPublicAiRoute(route: PublicAiRoute, extra: Record<string, unknown> = {}): Promise<NextResponse | null> {
  const ip = await resolveClientIp();
  if (!ip) return NextResponse.json({ error: "Could not identify this network.", ...extra }, { status: 429 });
  const limit = await checkPublicAiByIp(route, ip);
  if (limit.ok) return null;
  const retryAfter = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
  return NextResponse.json({ error: "Too many requests from this network. Try again in a moment.", ...extra }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
