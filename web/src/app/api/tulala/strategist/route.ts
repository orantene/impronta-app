/**
 * POST /api/tulala/strategist — Account Strategist turn for signed-in users.
 *
 * Authenticated only. Guests belong on `/get-started/agent`. Shares the turn
 * rate limit namespace: a customer chatting about their account is the same
 * metered surface as intake, and splitting the budget would only help abuse.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveClientIp } from "@/lib/guest/guest-session";
import {
  checkTulalaTurnByIp,
  checkTulalaTurnBySession,
  isTulalaKvConfigured,
} from "@/lib/rate-limit-kv-tulala";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { runStrategistTurn } from "@/lib/tulala/strategist.server";

const BodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  locale: z.enum(["en", "es"]).default("en"),
});

export async function POST(req: Request): Promise<Response> {
  if (!isTulalaKvConfigured()) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const bySession = await checkTulalaTurnBySession(session.user.id);
  if (!bySession.ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const ip = await resolveClientIp();
  if (ip) {
    const byIp = await checkTulalaTurnByIp(ip);
    if (!byIp.ok) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  const result = await runStrategistTurn({
    owner: { kind: "profile", profileId: session.user.id },
    message: body.message,
    locale: body.locale,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    learned: result.learned,
    proposals: result.proposals,
    briefVersion: result.briefVersion,
  });
}
