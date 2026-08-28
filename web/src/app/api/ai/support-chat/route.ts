import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import { isResolvedAiChatConfigured, resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { requireSession } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { assertTicketAccess } from "@/lib/support/support-access";
import { supportEngine } from "@/lib/support/support-engine";
import { insightRowsToCorpus, retrieveHelpEntries } from "@/lib/support/help-corpus";
import { loadConfirmedInsightCorpus } from "@/lib/support/insights/load";
import { wantsHumanSupport } from "@/lib/support/support-human-prefilter";
import { sanitizeSupportAiOutput } from "@/lib/support/support-ai-guardrails";
import { supportFrom } from "@/lib/support/support-from";
import {
  mapMessageRow,
  type SupportEscalationReason,
  type SupportMessageRow,
} from "@/lib/support/support-types";

const bodySchema = z.object({ ticketId: z.string().uuid() });

const SUPPORT_CHAT_SCHEMA = {
  name: "support_first_responder",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "answer",
      "confidence",
      "suggested_subject",
      "category",
      "tags",
      "sentiment",
      "escalate",
      "escalate_reason",
    ],
    properties: {
      answer: { type: "string" },
      confidence: { type: "number" },
      suggested_subject: { type: "string" },
      category: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
      escalate: { type: "boolean" },
      escalate_reason: {
        type: "string",
        enum: [
          "",
          "user_requested",
          "ai_low_confidence",
          "ai_sentiment",
          "ai_suggested",
          "ai_unavailable",
        ],
      },
    },
  },
} as const;

// Reasons the MODEL may claim. staff_initiated / user_requested are
// deliberately excluded — those are asserted by real actors, never by
// model output (a loose provider response must not forge attribution).
const REASONS = new Set<SupportEscalationReason>([
  "ai_low_confidence",
  "ai_sentiment",
  "ai_suggested",
  "ai_unavailable",
]);

const FAIL_OPEN_BODY =
  "I'm having trouble right now. Want me to get Oran?";

const SYSTEM_PROMPT = [
  "You are Tulala's in-app support assistant.",
  "Answer ONLY from the provided grounding entries and ticket context. If the answer is not there, say you are not sure and offer to get Oran.",
  "Do not invent refund amounts, legal statements, or payout promises.",
  "Never claim you performed an action (updated settings, issued a refund, booked talent).",
  "Tone: warm, plain, no em dashes.",
  "Keep the answer under 1200 characters.",
  "Entries labeled past confirmed resolution are owner-confirmed prior fixes.",
].join(" ");

type ModelOut = {
  answer: string;
  confidence: number;
  suggested_subject: string;
  category: string;
  tags: string[];
  sentiment: "positive" | "neutral" | "negative";
  escalate: boolean;
  escalate_reason: string;
};

function parseModel(text: string): ModelOut | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const sentiment = raw.sentiment;
    if (sentiment !== "positive" && sentiment !== "neutral" && sentiment !== "negative") {
      return null;
    }
    return {
      answer: typeof raw.answer === "string" ? raw.answer : "",
      confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
      suggested_subject: typeof raw.suggested_subject === "string" ? raw.suggested_subject : "",
      category: typeof raw.category === "string" ? raw.category : "",
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
      sentiment,
      escalate: raw.escalate === true,
      escalate_reason: typeof raw.escalate_reason === "string" ? raw.escalate_reason : "",
    };
  } catch {
    return null;
  }
}

async function failOpen(ticketId: string): Promise<void> {
  await supportEngine.appendMessage({
    ticketId,
    authorKind: "system",
    authorUserId: null,
    body: FAIL_OPEN_BODY,
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
    const flags = await getAiFeatureFlags();
    if (!flags.ai_master_enabled || !flags.ai_support_enabled) {
      return NextResponse.json({ skipped: "disabled" }, { status: 200 });
    }
    if (!(await isResolvedAiChatConfigured())) {
      return NextResponse.json({ skipped: "unconfigured" }, { status: 200 });
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { ticketId } = parsed.data;

    const session = await requireSession();
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: 401 });
    }
    const access = await assertTicketAccess(ticketId, session.user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    if (access.ticket.handledBy === "human") {
      return NextResponse.json({ skipped: "escalated" }, { status: 200 });
    }

    const admin = createServiceRoleClient();
    if (!admin) {
      await failOpen(ticketId);
      return NextResponse.json({ skipped: "unavailable" }, { status: 200 });
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

    const latestRequester = [...messages].reverse().find((m) => m.authorKind === "requester");
    if (latestRequester && wantsHumanSupport(latestRequester.body)) {
      await supportEngine.escalateTicket({
        ticketId,
        reason: "user_requested",
        actorUserId: session.user.id,
      });
      return NextResponse.json({ skipped: "prefilter" }, { status: 200 });
    }

    const gate = await assertAiInvocationAllowed(access.ticket.tenantId ?? DEFAULT_AI_TENANT_ID);
    if (!gate.ok) {
      await failOpen(ticketId);
      return NextResponse.json({ skipped: "gated" }, { status: 200 });
    }

    let planTier: string | null = null;
    if (access.ticket.tenantId) {
      const { data: agency } = await admin
        .from("agencies")
        .select("plan_tier")
        .eq("id", access.ticket.tenantId)
        .maybeSingle();
      planTier = (agency?.plan_tier as string | null) ?? null;
    }

    const lastThree = messages.slice(-3).map((m) => m.body);
    const confirmed = await loadConfirmedInsightCorpus();
    const grounding = retrieveHelpEntries(latestRequester?.body ?? access.ticket.subject, {
      originSlug: access.ticket.originSurfaceSlug,
      category: access.ticket.category,
      extraTexts: lastThree,
      extraCorpus: insightRowsToCorpus(confirmed),
    });

    const adapter = await resolveAiChatAdapter();
    const userMessage = JSON.stringify({
      ticket: {
        subject: access.ticket.subject,
        category: access.ticket.category,
        origin: access.ticket.originSurfaceSlug,
        surface: access.ticket.surface,
        planTier,
      },
      messages: messages.map((m) => ({
        role: m.authorKind,
        body: m.body.slice(0, 800),
      })),
      grounding: grounding.map((g) => ({
        slug: g.slug,
        purpose: g.purpose,
        youCanHere: g.youCanHere,
        faqs: g.faqs.slice(0, 4),
        category: g.ticketCategory,
        label: g.category,
      })),
    });

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
      await failOpen(ticketId);
      return NextResponse.json({ skipped: "model" }, { status: 200 });
    }

    const model = parseModel(completion.text);
    if (!model || !model.answer.trim()) {
      await failOpen(ticketId);
      return NextResponse.json({ skipped: "parse" }, { status: 200 });
    }

    const safe = sanitizeSupportAiOutput(model.answer);
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
      await failOpen(ticketId);
      return NextResponse.json({ skipped: "persist" }, { status: 200 });
    }

    const aiTurns = messages.filter((m) => m.authorKind === "ai").length + 1;
    if (aiTurns === 1 && (model.suggested_subject.trim() || model.category.trim())) {
      await supportEngine.setCategory({
        ticketId,
        category: model.category.trim() || access.ticket.category,
        subject: model.suggested_subject.trim() || null,
        actorKind: "ai",
        actorUserId: null,
      });
    }

    let escalateReason: SupportEscalationReason | null = null;
    if (safe.escalate) escalateReason = "ai_suggested";
    if (model.escalate) {
      const mapped = model.escalate_reason;
      escalateReason =
        mapped && REASONS.has(mapped as SupportEscalationReason)
          ? (mapped as SupportEscalationReason)
          : "ai_suggested";
    }
    if (confidence < 0.4) escalateReason = escalateReason ?? "ai_low_confidence";

    const priorAi = messages.filter((m) => m.authorKind === "ai");
    const lastAiSentiment =
      typeof priorAi[priorAi.length - 1]?.aiMeta?.sentiment === "string"
        ? String(priorAi[priorAi.length - 1]?.aiMeta?.sentiment)
        : null;
    if (model.sentiment === "negative" && lastAiSentiment === "negative") {
      escalateReason = escalateReason ?? "ai_sentiment";
    }

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
        body: "Want Oran to take a look?",
        messageKind: "card",
        cardPayload: { kind: "offer-human" },
        aiMeta: { escalate_reason: "ai_suggested" },
        skipNotify: true,
      });
    }

    recordAiUsageEstimate(access.ticket.tenantId ?? DEFAULT_AI_TENANT_ID).catch((err) =>
      logServerError("api/ai/support-chat/recordAiUsageEstimate", err),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("api/ai/support-chat", e);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
}
