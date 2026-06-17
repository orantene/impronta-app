import { NextResponse } from "next/server";
import { z } from "zod";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { pgUuidSchema } from "@/lib/site-admin/validators";

const eventNames = new Set<string>(Object.values(PRODUCT_ANALYTICS_EVENTS));

const bodySchema = z.object({
  name: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).optional(),
  session_id: z.string().max(256).nullable().optional(),
  talent_id: pgUuidSchema().nullable().optional(),
  /** Client-supplied tenant UUID. Validated as a PG UUID; treated as advisory
   * (unauthenticated route — a caller could spoof). Server-side derivation is
   * preferred where the request context allows it. */
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
    tenantId: tenant_id ?? null,
    path: path ?? null,
    locale: locale ?? null,
  });

  return NextResponse.json({ ok: true });
}
