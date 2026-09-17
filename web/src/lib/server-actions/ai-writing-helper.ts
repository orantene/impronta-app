"use server";

/**
 * Writing helper actions (Phase 9): the talent's own bio, written, rewritten,
 * expanded, shortened or re-toned from their facts. The model never sees a
 * fact that is not on the profile; the draft never reaches the screen unless
 * it passes the same floor the deterministic bio passes. Per-tenant daily cap.
 */

import { resolveRoutedChat } from "@/lib/ai/call-routing.server";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { BIO_MAX_CHARS, buildWritingPrompt, screenWrittenText, WRITING_OPS, WRITING_TONES, type WritingFacts, type WritingOp, type WritingTone } from "@/lib/ai/writing-helper";
import { logServerError } from "@/lib/server/safe-error";
import { selfFacts, underDailyCap, writeMyBio } from "@/lib/talent/bio-helper.server";

export type BioHelperState = { ok: true; text: string; facts: WritingFacts; tenantId: string | null } | { ok: false; code: "not_authenticated" | "no_profile" | "failed" };

type Locale = "es" | "en";

export async function loadMyBio(): Promise<BioHelperState> {
  const self = await selfFacts();
  if (!self) return { ok: false, code: "no_profile" };
  return { ok: true, text: self.text, facts: self.facts, tenantId: self.tenantId };
}

export type WriteResult = { ok: true; text: string } | { ok: false; code: "not_authenticated" | "no_profile" | "ai_off" | "cap" | "unusable" | "failed"; message?: string };

/** One helper call. Returns the draft only; nothing is saved until `saveMyBio`. */
export async function aiWriteMyBio(input: { op: WritingOp; tone?: WritingTone | null; text: string; locale: Locale }): Promise<WriteResult> {
  if (!WRITING_OPS.includes(input.op)) return { ok: false, code: "failed" };
  if (input.tone && !WRITING_TONES.includes(input.tone)) return { ok: false, code: "failed" };
  const self = await selfFacts();
  if (!self) return { ok: false, code: "no_profile" };
  const tenantId = self.tenantId;
  const gate = tenantId ? await assertAiInvocationAllowed(tenantId) : await assertAiInvocationAllowed();
  if (!gate.ok) return { ok: false, code: "ai_off" };
  if (tenantId && !(await underDailyCap(tenantId))) return { ok: false, code: "cap" };

  const { adapter, model } = await resolveRoutedChat(input.op === "write" ? "copy" : "helper");
  const prompt = buildWritingPrompt({ surface: "bio", op: input.op, tone: input.tone ?? null, text: input.text.slice(0, 1200), locale: input.locale, facts: self.facts });
  const t0 = Date.now();
  const result = await adapter.chatCompletion({ ...prompt, maxTokens: 400, temperature: input.op === "write" ? 0.7 : 0.5, model });
  void recordAiGenerationUsage({
    provider: adapter.id,
    model: result.ok ? (result.model ?? model ?? "auto") : (model ?? "auto"),
    usage: result.ok ? result.usage : undefined,
    actorProfileId: null,
    ok: result.ok,
    scope: "writing_helper",
    latencyMs: Date.now() - t0,
    tenantId,
    context: { surface: "bio", op: input.op, tone: input.tone ?? null, talent_profile_id: self.id },
  }).catch((err) => logServerError("writingHelper.usage", err));
  if (!result.ok) return { ok: false, code: "failed", message: result.message };
  const screened = screenWrittenText(result.text);
  if (!screened.ok) return { ok: false, code: "unusable", message: screened.reason };
  return { ok: true, text: screened.text };
}

export async function saveMyBio(input: { text: string; locale: Locale }): Promise<{ ok: true } | { ok: false; code: "no_profile" | "invalid" | "failed" }> {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text.length === 0 || text.length > BIO_MAX_CHARS || /[—–]/.test(text)) return { ok: false, code: "invalid" };
  const self = await selfFacts();
  if (!self) return { ok: false, code: "no_profile" };
  return writeMyBio(self, text, input.locale);
}
