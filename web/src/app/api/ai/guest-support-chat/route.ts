import { SUPPORT_AGENT } from "@/lib/support/support-persona";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { isResolvedAiChatConfigured, resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { improntaLog } from "@/lib/server/structured-log";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { guestCookieSigningEnabled } from "@/lib/guest-cookie";
import { resolveClientIp, resolveGuestSessionId } from "@/lib/guest/guest-session";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadOwnedGuestTicket } from "@/lib/support/guest-access";
import { buildGuestCorpus, flattenGroundingText, type GuestCorpusLocale } from "@/lib/support/guest-corpus";
import { retrieveHelpEntries } from "@/lib/support/help-corpus";
import { supportEngine } from "@/lib/support/support-engine";
import { wantsHumanSupport } from "@/lib/support/support-human-prefilter";
import { sanitizeGuestAiOutput } from "@/lib/support/support-ai-guardrails";
import { supportFrom } from "@/lib/support/support-from";
import {
  SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY,
  SUPPORT_CHAT_REASONS,
  SUPPORT_CHAT_SCHEMA,
  parseSupportChatModel,
} from "@/lib/support/support-chat-shared";
import {
  countGuestAiTurns,
  guestAiTurnCeilingReached,
} from "@/lib/support/guest-ai-turns";
import {
  checkSupportGuestAiByIp,
  isKvLimiterConfigured,
} from "@/lib/rate-limit-kv-guest-support";
import {
  mapMessageRow,
  type SupportEscalationReason,
  type SupportMessageRow,
} from "@/lib/support/support-types";

const bodySchema = z.object({ ticketId: z.string().uuid() });

const SYSTEM_PROMPT = [
  "You are Tulala's marketing-site assistant for people who are not signed into a workspace.",
  `Answer ONLY from the provided grounding entries. If the answer is not there, say you are not sure and offer to get ${SUPPORT_AGENT.name}.`,
  "Entries whose purpose starts with ON THE ROADMAP are not shipped. Never sell them as available.",
  "Do not invent prices. Only quote amounts that appear in the grounding text.",
  "Do not invent phone numbers or email addresses.",
  "Do not claim you performed an action.",
  "Tone: warm, plain, no em dashes.",
  "Answer in the same language as the latest guest question.",
  "Keep the answer under 1200 characters.",
].join(" ");

/**
 * Record WHY the guest AI gave up, then fail open.
 *
 * Every one of the three fail-open branches below returned HTTP 200 and wrote
 * nothing anywhere. So a broken assistant looked identical to a working one
 * from outside, and the only trace was `escalation_reason = ai_unavailable` on
 * the ticket — which says the AI did not answer, not why.
 *
 * That is how this went unnoticed: EVERY organic guest question this product
 * has ever received (tickets #11, #19, #28) escalated with ai_unavailable, and
 * nobody could tell whether the key was wrong, the model was refused, the JSON
 * failed to parse, or the write failed. A silent failure in the one component
 * whose whole job is to answer strangers is worse than a loud one.
 */
async function failOpen(ticketId: string, stage: string, detail?: string): Promise<void> {
  void improntaLog("support.guest_ai.fail_open", { ticketId, stage, detail: detail ?? null });
  await supportEngine.appendMessage({
    ticketId,
    authorKind: "system",
    authorUserId: null,
    body: SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY,
    messageKind: "system",
    skipNotify: true,
  });
  await supportEngine.escalateTicket({
    ticketId,
    reason: "ai_unavailable",
    actorUserId: null,
  });
}

export async function POST(request: Request) {
  try {
    const { guestAiAbuseFloor } = await import("@/lib/support/guest-ai-abuse-floor");
    const floor = guestAiAbuseFloor({
      signingEnabled: guestCookieSigningEnabled(),
      kvConfigured: isKvLimiterConfigured(),
    });
    if (!floor.ok) {
      return NextResponse.json({ error: floor.error }, { status: floor.status });
    }

    const flags = await getAiFeatureFlags();
    if (!flags.ai_master_enabled || !flags.ai_support_enabled) {
      return NextResponse.json({ skipped: "disabled" }, { status: 200 });
    }
    if (!(await isResolvedAiChatConfigured())) {
      return NextResponse.json({ skipped: "unconfigured" }, { status: 200 });
    }

    const ip = await resolveClientIp();
    if (!ip) {
      return NextResponse.json({ error: "Could not identify this network." }, { status: 429 });
    }
    const ipLimit = await checkSupportGuestAiByIp(ip);
    if (!ipLimit.ok) {
      return NextResponse.json({ error: "Too many questions from this network." }, { status: 429 });
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { ticketId } = parsed.data;

    const admin = createServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "Unavailable." }, { status: 503 });
    }
    const guestSessionId = await resolveGuestSessionId();
    const actor = await getCachedActorSession();
    const ticket = await loadOwnedGuestTicket(admin, ticketId, {
      guestSessionId,
      userId: actor.user?.id ?? null,
    });
    if (!ticket || ticket.surface !== "guest") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (ticket.handledBy === "human") {
      return NextResponse.json({ skipped: "escalated" }, { status: 200 });
    }

    const { data: msgRows } = await supportFrom(admin, "support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(20);
    const messages = ((msgRows ?? []) as unknown[])
      .map(mapMessageRow)
      .filter((m): m is SupportMessageRow => Boolean(m))
      .reverse();

    const existingAiTurns = countGuestAiTurns(messages);
    if (guestAiTurnCeilingReached(existingAiTurns)) {
      return NextResponse.json({ error: "This chat has reached its answer limit." }, { status: 429 });
    }

    const latestRequester = [...messages].reverse().find((m) => m.authorKind === "requester");
    if (latestRequester && wantsHumanSupport(latestRequester.body)) {
      await supportEngine.escalateTicket({
        ticketId,
        reason: "user_requested",
        actorUserId: actor.user?.id ?? null,
      });
      return NextResponse.json({ skipped: "prefilter" }, { status: 200 });
    }

    const gate = await assertAiInvocationAllowed(ticket.tenantId ?? DEFAULT_AI_TENANT_ID);
    if (!gate.ok) {
      // A spend cap or a tenant control refusing the call looks exactly like a
      // broken model from the visitor's side. Name it.
      await failOpen(ticketId, "gated", "reason" in gate ? String(gate.reason) : undefined);
      return NextResponse.json({ skipped: "gated" }, { status: 200 });
    }

    const locale: GuestCorpusLocale = ticket.metadata.locale === "es" ? "es" : "en";
    const corpus = buildGuestCorpus(locale);
    const lastThree = messages.slice(-3).map((m) => m.body);
    const grounding = retrieveHelpEntries(latestRequester?.body ?? ticket.subject, {
      originSlug: ticket.originSurfaceSlug,
      category: ticket.category,
      extraTexts: lastThree,
      corpus,
    });
    const groundingText = flattenGroundingText(grounding);

    const guestTurns = messages
      .filter((m) => m.authorKind === "requester")
      .map((m) => m.body.slice(0, 800));
    const userMessage = [
      "GROUNDING_BEGIN",
      JSON.stringify(
        grounding.map((g) => ({
          slug: g.slug,
          purpose: g.purpose,
          youCanHere: g.youCanHere,
          faqs: g.faqs.slice(0, 4),
          category: g.ticketCategory,
        })),
      ),
      "GROUNDING_END",
      "UNTRUSTED_GUEST_TURNS_BEGIN",
      JSON.stringify(guestTurns),
      "UNTRUSTED_GUEST_TURNS_END",
      `locale=${locale}`,
    ].join("\n");

    const adapter = await resolveAiChatAdapter();
    const completion = await Promise.race([
      adapter.chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        temperature: 0.2,
        maxTokens: 700,
        jsonSchema: {
          name: SUPPORT_CHAT_SCHEMA.name,
          strict: SUPPORT_CHAT_SCHEMA.strict,
          schema: SUPPORT_CHAT_SCHEMA.schema as unknown as Record<string, unknown>,
        },
      }),
      new Promise<{ ok: false; code: string; message: string }>((resolve) => {
        setTimeout(() => resolve({ ok: false, code: "timeout", message: "timeout" }), 20_000);
      }),
    ]);

    if (!completion.ok) {
      // The provider's own words — an expired key, a refused model and a
      // timeout are three different problems with three different fixes.
      await failOpen(ticketId, "model", `${completion.code}: ${completion.message}`.slice(0, 300));
      return NextResponse.json({ skipped: "model" }, { status: 200 });
    }

    const model = parseSupportChatModel(completion.text);
    if (!model || !model.answer.trim()) {
      await failOpen(ticketId, "parse", completion.text?.slice(0, 200));
      return NextResponse.json({ skipped: "parse" }, { status: 200 });
    }

    const safe = sanitizeGuestAiOutput(model.answer, groundingText);
    const confidence = Math.min(1, Math.max(0, model.confidence));

    const persisted = await supportEngine.appendMessage({
      ticketId,
      authorKind: "ai",
      authorUserId: null,
      body: safe.text,
      aiMeta: {
        model: completion.model ?? null,
        confidence,
        grounding_slugs: grounding.map((g) => g.slug),
        sentiment: model.sentiment,
      },
      skipNotify: true,
    });
    if (!persisted.ok) {
      await failOpen(ticketId, "persist");
      return NextResponse.json({ skipped: "persist" }, { status: 200 });
    }

    const aiTurns = existingAiTurns + 1;
    if (aiTurns === 1 && (model.suggested_subject.trim() || model.category.trim())) {
      const rawSubject = model.suggested_subject.trim();
      const subject = rawSubject
        ? (rawSubject.toLowerCase().startsWith("[guest]") ? rawSubject : `[guest] ${rawSubject}`)
        : null;
      await supportEngine.setCategory({
        ticketId,
        category: model.category.trim() || ticket.category,
        subject,
        actorKind: "ai",
        actorUserId: null,
      });
    }

    let escalateReason: SupportEscalationReason | null = null;
    if (safe.escalate) escalateReason = "ai_suggested";
    if (model.escalate) {
      const mapped = model.escalate_reason;
      escalateReason =
        mapped && SUPPORT_CHAT_REASONS.has(mapped as SupportEscalationReason)
          ? (mapped as SupportEscalationReason)
          : "ai_suggested";
    }
    if (confidence < 0.4) escalateReason = escalateReason ?? "ai_low_confidence";

    if (escalateReason) {
      await supportEngine.escalateTicket({
        ticketId,
        reason: escalateReason,
        actorUserId: null,
      });
    } else if (aiTurns >= 3) {
      await supportEngine.appendMessage({
        ticketId,
        authorKind: "ai",
        authorUserId: null,
        body: `Want ${SUPPORT_AGENT.name} to take a look?`,
        messageKind: "card",
        cardPayload: { kind: "offer-human" },
        aiMeta: { escalate_reason: "ai_suggested" },
        skipNotify: true,
      });
    }

    recordAiUsageEstimate(ticket.tenantId ?? DEFAULT_AI_TENANT_ID).catch((err) =>
      logServerError("api/ai/guest-support-chat/recordAiUsageEstimate", err),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/ai/guest-support-chat", e);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
}
