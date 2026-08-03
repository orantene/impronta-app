import { NextResponse } from "next/server";
import { z } from "zod";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { deriveTenantIdFromRequest } from "@/lib/analytics/derive-tenant";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import { tryConsumeRateLimit, rateLimitJsonResponse } from "@/lib/rate-limit";

// Edge rate-limit budget for the unauthenticated ingest. A funnel-heavy guest
// session legitimately fires a handful of events per interaction; 120/min/IP is
// generous for a real visitor and still caps a fuzzer. Fixed-window, per-IP, in
// process memory (see rate-limit.ts caveats: per-instance, not a global view) —
// adequate hardening for this best-effort, no-PII analytics route.
const RATE_LIMIT_PER_MIN = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

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
  // Edge rate-limit (per-IP fixed window) before parsing/DB work, so a flood
  // is rejected cheaply. Vercel sets x-forwarded-for; fall back to "unknown".
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (!tryConsumeRateLimit(`analytics:${ip}`, RATE_LIMIT_PER_MIN, RATE_LIMIT_WINDOW_MS)) {
    return rateLimitJsonResponse();
  }

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

  // `talent_id` belongs in the COLUMN, not just the payload — every
  // per-talent query (demand ranking, profile analytics) filters on it. Every
  // caller passes it inside `payload` via trackProductEvent, and only
  // `tenant_id`/`referrer` were being promoted, so the column was null on
  // 100% of rows and the demand signal had no data source at all. Falling back
  // to the payload here fixes all existing call sites at once.
  const payloadTalentId =
    typeof mergedPayload.talent_id === "string" ? mergedPayload.talent_id : null;
  const resolvedTalentId =
    talent_id ?? (pgUuidSchema().safeParse(payloadTalentId).success ? payloadTalentId : null);

  await logAnalyticsEventServer({
    name,
    payload: mergedPayload,
    sessionId: session_id ?? null,
    talentId: resolvedTalentId,
    tenantId,
    path: path ?? null,
    locale: locale ?? null,
  });

  return NextResponse.json({ ok: true });
}
