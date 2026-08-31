/**
 * POST /api/tulala/turn — one turn of the intake conversation, streamed.
 *
 * A transport shell on purpose. Ordering, guardrails and every product decision
 * live in `turn.server.ts` and its pure neighbours; this file admits the request
 * and frames the stream.
 *
 * FAIL CLOSED. This is an anonymous, unauthenticated endpoint that spends tokens
 * on every call, so the gates run in cost order — free local checks, then KV,
 * then the model — and the endpoint refuses outright when its limiter is not
 * configured. A deploy that loses Upstash should degrade to "the assistant is
 * off", never to "the assistant is free for everyone".
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { sseResponse, type SseFrame } from "@/lib/ai/stream";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { resolveClientIp, resolveGuestSessionId } from "@/lib/guest/guest-session";
import { guestCookieSigningEnabled } from "@/lib/guest-cookie";
import {
  checkTulalaTurnByIp,
  checkTulalaTurnBySession,
  isTulalaKvConfigured,
} from "@/lib/rate-limit-kv-tulala";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import { ensureBrief, type BriefOwner } from "@/lib/tulala/brief-store.server";
import { runTurn } from "@/lib/tulala/turn.server";
import { packForBrief } from "@/lib/tulala/pack-for-brief";
import { MAX_USER_MESSAGE_CHARS, type ConversationState } from "@/lib/tulala/conversation";

const BodySchema = z.object({
  message: z.string().min(1).max(MAX_USER_MESSAGE_CHARS),
  locale: z.enum(["en", "es"]).default("en"),
  /**
   * The question the client had on screen. Client-supplied because the server
   * keeps no per-session conversation row, and it is SAFE to trust: it only
   * selects a question from a static bank for telemetry and prompt context. An
   * invalid id degrades to null, and no authorisation reads it.
   */
  pendingQuestionId: z.string().max(80).nullable().default(null),
  /**
   * Questions already put to this visitor. Also client-supplied, for the same
   * reason, and also non-authoritative: the real ceiling is `userTurns`, which
   * is derived server-side from the Brief, and the KV limiters do not consult
   * this at all. Worst case a visitor replays their own question order.
   */
  asked: z
    .array(z.object({ questionId: z.string().max(80), asks: z.number().int().min(0).max(9) }))
    .max(60)
    .default([]),
  userTurns: z.number().int().min(0).max(200).default(0),
  wantsToWrapUp: z.boolean().default(false),
});

function errorJson(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  // ── Abuse floor, before anything costs anything ────────────────────────────
  if (!guestCookieSigningEnabled() || !isTulalaKvConfigured()) {
    return errorJson(503, "The assistant is temporarily unavailable.");
  }

  const flags = await getAiFeatureFlags();
  if (!flags.ai_master_enabled || !flags.ai_tulala_agent_enabled) {
    return errorJson(503, "The assistant is switched off right now.");
  }
  if (!(await isResolvedAiChatConfigured())) {
    return errorJson(503, "The assistant is not configured.");
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return errorJson(400, "Bad request.");
  }

  const ip = await resolveClientIp();
  if (!ip) {
    // No IP means no per-machine ceiling, and this endpoint is too expensive to
    // run without one.
    return errorJson(429, "Too many requests.");
  }

  const ipLimit = await checkTulalaTurnByIp(ip);
  if (!ipLimit.ok) return errorJson(429, "Too many requests. Try again shortly.");

  // ── Identity: signed in, or the signed guest cookie ────────────────────────
  const session = await getCachedActorSession();
  const guestSessionId = session.user ? null : await resolveGuestSessionId();

  if (!session.user && !guestSessionId) {
    return errorJson(503, "Could not start a session.");
  }

  const sessionScopeId = session.user?.id ?? guestSessionId!;
  const sessionLimit = await checkTulalaTurnBySession(sessionScopeId);
  if (!sessionLimit.ok) {
    return errorJson(429, "That is a lot of messages. Give it a minute.");
  }

  const owner: BriefOwner = session.user
    ? { kind: "profile", profileId: session.user.id }
    : { kind: "guest", guestSessionId: guestSessionId! };

  const ensured = await ensureBrief(owner, { locale: body.locale });
  if (!ensured.ok) {
    logServerError("tulala.turn.ensureBrief", new Error(ensured.error));
    return errorJson(503, "Could not open your brief.");
  }

  const brief = ensured.brief;
  const state: ConversationState = {
    knownFactKeys: new Set(brief.facts.map((f) => f.factKey)),
    confirmedFactKeys: new Set(
      brief.facts.filter((f) => f.status === "confirmed").map((f) => f.factKey),
    ),
    asked: body.asked,
    userTurns: body.userTurns,
    hasEmail: Boolean(session.user),
    isAuthenticated: Boolean(session.user),
    wantsToWrapUp: body.wantsToWrapUp,
    // Seeded from what is already known so a returning session resumes inside
    // its pack. `runTurn` recomputes it after each extraction.
    pack: packForBrief(brief),
  };

  const scope = {
    sessionId: guestSessionId ?? null,
    userId: session.user?.id ?? null,
    locale: body.locale,
  };

  return sseResponse(async function* (): AsyncIterable<SseFrame> {
    for await (const event of runTurn({
      owner,
      brief,
      userMessage: body.message,
      locale: body.locale,
      pendingQuestionId: body.pendingQuestionId,
      state,
      scope,
    })) {
      switch (event.type) {
        case "understood":
          yield { event: "understood", data: { learned: event.learned, panel: event.panel } };
          break;
        case "text":
          yield { event: "text", data: { delta: event.delta } };
          break;
        case "done":
          yield {
            event: "done",
            data: {
              reply: event.reply,
              nextQuestionId: event.nextQuestionId,
              move: event.move,
              emailAsk: event.emailAsk,
              panel: event.panel,
            },
          };
          break;
        case "error":
          yield { event: "error", data: { code: event.code, message: event.message } };
          break;
      }
    }
  });
}
