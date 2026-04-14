import { NextResponse } from "next/server";
import { z } from "zod";
import { logAnalyticsEventServer } from "@/lib/analytics/server-log";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

const eventNames = new Set<string>(Object.values(PRODUCT_ANALYTICS_EVENTS));

const bodySchema = z.object({
  name: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).optional(),
  session_id: z.string().max(256).nullable().optional(),
  talent_id: z.string().uuid().nullable().optional(),
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

  const { name, payload, session_id, talent_id, path, locale } = parsed.data;

  if (!eventNames.has(name)) {
    return NextResponse.json({ error: "Unknown event name" }, { status: 400 });
  }

  await logAnalyticsEventServer({
    name,
    payload: (payload ?? {}) as Record<string, unknown>,
    sessionId: session_id ?? null,
    talentId: talent_id ?? null,
    path: path ?? null,
    locale: locale ?? null,
  });

  return NextResponse.json({ ok: true });
}
