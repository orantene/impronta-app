/**
 * strategist.server.ts — authenticated Account Strategist turn.
 *
 * Same Brief, same extractor, different job. The visitor is already a customer;
 * the conversation is about what changed in their operation, not about which
 * product to open. Upgrade triggers recorded at signup are evaluated here
 * against the facts that just arrived.
 *
 * L20 HOLDS HARDER HERE
 * ─────────────────────
 * Raising an upgrade is a draft. Marking a Talent Profile quiet is a draft.
 * Nothing in this file charges a card, deactivates a row, or rewrites a live
 * site. The reply names what would change and asks; the Settings surfaces and
 * billing flows are what actually do it once the person agrees.
 */

import "server-only";

import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";
import { assertAiInvocationAllowed, recordAiUsageEstimate } from "@/lib/ai/ai-usage-gate";
import { logServerError } from "@/lib/server/safe-error";

import { sanitizeAgentReply } from "./agent-guardrails";
import {
  loadBrief,
  recordFacts,
  snapshotBrief,
  type BriefOwner,
} from "./brief-store.server";
import type { Brief, FactInput } from "./brief-store";
import { EXTRACTION_SCHEMA, parseExtraction } from "./extraction";
import { packForBrief } from "./pack-for-brief";
import { buildExtractionPrompt, buildExtractionMessage } from "./prompts";
import {
  evaluatePendingTriggers,
  proposalsFromEvaluation,
  strategistNotes,
  type StrategistProposal,
} from "./strategist";
import {
  listPendingUpgradeTriggers,
  resolveUpgradeTrigger,
} from "./upgrade-triggers.server";

export type StrategistTurnRequest = {
  owner: BriefOwner;
  message: string;
  locale: "en" | "es";
};

export type StrategistTurnResult =
  | {
      ok: true;
      reply: string;
      learned: Array<{ factKey: string; value: unknown; confidence: number }>;
      proposals: StrategistProposal[];
      briefVersion: number;
    }
  | { ok: false; error: string };

export async function runStrategistTurn(
  request: StrategistTurnRequest,
): Promise<StrategistTurnResult> {
  if (request.owner.kind !== "profile") {
    return { ok: false, error: "Sign in to talk about your account." };
  }

  const brief = await loadBrief(request.owner);
  if (!brief) {
    return { ok: false, error: "No brief yet. Start with the Tulala Agent first." };
  }

  const gate = await assertAiInvocationAllowed();
  if (!gate.ok) {
    return { ok: false, error: "Unavailable right now." };
  }

  const pack = packForBrief(brief);
  const learned = await extractFacts({
    brief,
    message: request.message,
    pack,
  });

  let refreshed = brief;
  if (learned.length > 0) {
    const written = await recordFacts(
      brief.id,
      learned.map(
        (f): FactInput => ({
          factKey: f.factKey,
          value: f.value,
          source: "user_stated",
          confidence: f.confidence,
          sourceExcerpt: f.sourceExcerpt,
        }),
      ),
    );
    if (written.written.length > 0) {
      await snapshotBrief(brief.id, {
        expectedVersion: brief.currentVersion,
        reason: "repositioning",
      });
      refreshed = (await loadBrief(request.owner)) ?? brief;
    }
  }

  const pending = await listPendingUpgradeTriggers(refreshed.id);
  const fired = evaluatePendingTriggers(refreshed, pending);
  const notes = strategistNotes(
    refreshed,
    learned.map((l) => l.factKey),
  );
  const proposals = proposalsFromEvaluation(fired, notes);

  for (const f of fired) {
    await resolveUpgradeTrigger(refreshed.id, f.trigger.triggerKey, "fired");
  }

  const reply = await composeReply({
    message: request.message,
    locale: request.locale,
    proposals,
    justLearned: learned.map((l) => ({ factKey: l.factKey, value: l.value })),
  });

  void recordAiUsageEstimate().catch(() => {});

  return {
    ok: true,
    reply: reply.text,
    learned: learned.map((l) => ({
      factKey: l.factKey,
      value: l.value,
      confidence: l.confidence,
    })),
    proposals,
    briefVersion: refreshed.currentVersion,
  };
}

async function extractFacts(input: {
  brief: Brief;
  message: string;
  pack: ReturnType<typeof packForBrief>;
}): Promise<
  Array<{
    factKey: string;
    value: unknown;
    confidence: number;
    sourceExcerpt: string | null;
  }>
> {
  try {
    const adapter = await resolveAiChatAdapter();
    const completion = await adapter.chatCompletion({
      systemPrompt: buildExtractionPrompt({ pack: input.pack }),
      userMessage: buildExtractionMessage({
        userMessage: input.message,
        brief: input.brief,
        question: null,
      }),
      jsonSchema: EXTRACTION_SCHEMA,
      maxTokens: 900,
      temperature: 0,
    });
    if (!completion.ok) return [];
    const parsed = parseExtraction(completion.text, {
      questionId: null,
      questionVersion: null,
      allowPhysicalAttributes: input.pack?.id === "model",
    });
    return parsed.facts.map((f) => ({
      factKey: f.factKey,
      value: f.value,
      confidence: f.confidence ?? 0.85,
      sourceExcerpt: f.sourceExcerpt ?? null,
    }));
  } catch (error) {
    logServerError("tulala.strategist.extract", error);
    return [];
  }
}

async function composeReply(input: {
  message: string;
  locale: "en" | "es";
  proposals: StrategistProposal[];
  justLearned: Array<{ factKey: string; value: unknown }>;
}): Promise<{ text: string }> {
  // Prefer a deterministic reply when we have something concrete to say. An LLM
  // paraphrase of a raised trigger is how soft upsells creep back in.
  const raised = input.proposals.filter((p) => p.kind === "raise_upgrade");
  const notes = input.proposals.filter((p) => p.kind === "note");

  if (raised.length > 0 || notes.length > 0) {
    const parts: string[] = [];
    for (const p of notes) {
      if (p.kind === "note") parts.push(p.text);
    }
    for (const p of raised) {
      if (p.kind === "raise_upgrade") {
        const why =
          p.trigger.rationale ??
          "Things have changed in a way that makes a paid plan the honest answer.";
        // Avoid naming a plan "tier" so the intake guardrail does not strip the
        // sentence. The upgrade card carries the plan key; the reply carries the
        // reason in the person's own situation.
        parts.push(
          `${why} Nothing changes until you say so. I have left the suggestion on your brief.`,
        );
      }
    }
    if (parts.length === 0) parts.push("Got it. I have updated your brief.");
    const text = sanitizeAgentReply(parts.join(" "), {
      locale: input.locale,
      move: "strategist",
    }).text;
    return { text: text || fallbackIdle(input.locale) };
  }

  try {
    const adapter = await resolveAiChatAdapter();
    const completion = await adapter.chatCompletion({
      systemPrompt: [
        "You are the Tulala Account Strategist for an existing customer.",
        "You already know their Brief. Do not re-qualify them for a product.",
        "Do not invent prices, plans, trial lengths, or capabilities.",
        "Do not ask them to sign up. They already have an account.",
        "Do not name Studio, Agency, Website, Network, or Standard as something they should buy.",
        "Keep replies to one or two short sentences.",
        "Offer to note changes in their Brief.",
        input.locale === "es" ? "Reply in Spanish using tú." : "Reply in English.",
      ].join(" "),
      userMessage: [
        input.justLearned.length > 0
          ? `Just noted: ${input.justLearned.map((f) => `${f.factKey}=${JSON.stringify(f.value)}`).join(", ")}`
          : "Nothing new extracted from their message.",
        "",
        `They said: ${input.message}`,
      ].join("\n"),
      maxTokens: 220,
      temperature: 0.4,
    });
    if (!completion.ok) return { text: fallbackIdle(input.locale) };
    const cleaned = sanitizeAgentReply(completion.text, {
      locale: input.locale,
      move: "strategist",
    }).text;
    return { text: cleaned || fallbackIdle(input.locale) };
  } catch (error) {
    logServerError("tulala.strategist.reply", error);
    return { text: fallbackIdle(input.locale) };
  }
}

function fallbackIdle(locale: "en" | "es"): string {
  return locale === "es"
    ? "Entendido. Cuéntame qué cambió en tu operación y lo anoto en tu brief."
    : "Got it. Tell me what changed in how you work and I will note it in your brief.";
}
