import { NextResponse } from "next/server";
import { z } from "zod";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { deriveTenantIdFromRequest } from "@/lib/analytics/derive-tenant";
import { pgUuidSchema } from "@/lib/site-admin/validators";

const eventNames = new Set<string>(Object.values(PRODUCT_ANALYTICS_EVENTS));

const bodySchema = z.object({
  name: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).optional(),
  session_id: z.string().max(256).nullable().optional(),
  talent_id: pgUuidSchema().nullable().optional(),
  /** Client-supplied tenant UUID. Spoofable on this unauthenticated route, so
   * it is treated as a HINT only — honored solely when it matches the
   * server-derived tenant (see deriveTenantIdFromRequest), else dropped. */
  tenant_id: pgUuidSchema().nullable().optional(),
  /** Document referrer for top-referrers analytics (truncated to 2048 chars). */
  referrer: z.string().max(2048).nullable().optional(),
  path: z.string().max(2048).nullable().optional(),
  locale: z.string().max(16).nullable().optional(),
});

/**
 * Accepts product analytics events from the browser for internal storage (dual-write with GA).
 * Does not require auth; rate limiting should be added at the edge for production scale.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { name, payload, session_id, talent_id, tenant_id, referrer, path, locale } = parsed.data;

  if (!eventNames.has(name)) {
    return NextResponse.json({ error: "Unknown event name" }, { status: 400 });
  }

  // ANALYTICS-1 — derive the tenant the SERVER can prove from the request
  // (Host → agency_domains). The client-supplied `tenant_id` is demoted to a
  // hint: honored only when it matches the derived value, dropped otherwise.
  // This route is short-circuited by the proxy before host resolution, so the
  // derivation does its own agency_domains read here. Degrade-safe: a host that
  // maps to no tenant yields a null tenant and the event still writes.
  const { tenantId } = await deriveTenantIdFromRequest({
    hostHeader: request.headers.get("host"),
    clientHint: tenant_id ?? null,
  });

  // Merge referrer into payload so the top-referrers loader can group by it.
  // analytics_events has no dedicated referrer column; payload is jsonb.
  const mergedPayload: Record<string, unknown> = {
    ...(payload ?? {}),
    ...(referrer != null ? { referrer } : {}),
  };

  await logAnalyticsEventServer({
    name,
    payload: mergedPayload,
    sessionId: session_id ?? null,
    talentId: talent_id ?? null,
    tenantId,
    path: path ?? null,
    locale: locale ?? null,
  });

  return NextResponse.json({ ok: true });
}
