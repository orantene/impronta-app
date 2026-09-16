"use server";

/**
 * Onboarding module — server actions behind the shared overlay.
 *
 * The overlay runs on the marketing host as a guest until the account step,
 * so every action resolves the brief owner the same way the Tulala intake does
 * (session, then the signed guest cookie, then refuse) and persists progress
 * on the brief's `module_state`. Nothing here invents a fact: the person's
 * words are recorded with provenance by the understand step (Phase 3); this
 * file only carries progress, choices and the raw input across reloads and
 * across the guest → account boundary.
 *
 * Gated by `onboarding_module_enabled`: with the flag off every action refuses,
 * so a stale client can never write progress the product does not show.
 */

import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";
import { archiveBrief, ensureBrief, loadBrief } from "@/lib/tulala/brief-store.server";
import { updateBriefModuleState } from "@/lib/tulala/brief-module-state.server";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  MAX_INPUT_CHARS,
  MIN_INPUT_WORDS,
  parsePersistedModuleState,
  wordCount,
  type ModuleInput,
  type ModuleStep,
  type OnboardingIntent,
  type PersistedModuleState,
  type ResumeSnapshot,
} from "@/lib/onboarding/module-state";
import { detectLink } from "@/lib/tulala/detect-url";

export type ModuleActionError = {
  ok: false;
  code: "module_off" | "no_owner" | "no_brief" | "too_short" | "too_long" | "save_failed";
};

export type StartDraftResult =
  | { ok: true; briefId: string; resume: ResumeSnapshot | null }
  | ModuleActionError;

async function moduleOn(): Promise<boolean> {
  const flags = await getOnboardingFlags();
  return flags.onboarding_module_enabled;
}

/**
 * Called when the overlay opens. Does NOT create a brief or a guest session:
 * opening the module is not a commitment (spec 1: "session on first input").
 * Returns a resume snapshot when the owner already has a brief past entry.
 */
export async function loadOnboardingResume(): Promise<ResumeSnapshot | null> {
  if (!(await moduleOn())) return null;
  const session = await getCachedActorSession();
  const auth = { isAuthenticated: !!session.user, email: session.user?.email ?? null };
  const resolved = await resolveBriefOwner();
  if (!resolved) return { briefId: null, state: {}, ...auth };
  const brief = await loadBrief(resolved.owner);
  if (!brief) return { briefId: null, state: {}, ...auth };
  return { briefId: brief.id, state: parsePersistedModuleState(brief.moduleState), ...auth };
}

/**
 * First input: the sentence (or link) the person gave. Creates the brief for
 * this owner when there is none, stores the input and moves the step to
 * `reading`. The understand step (Phase 3) reads it from there.
 */
export async function submitOnboardingInput(input: {
  intent: OnboardingIntent;
  locale: "en" | "es";
  text: string;
}): Promise<{ ok: true; briefId: string; input: ModuleInput } | ModuleActionError> {
  if (!(await moduleOn())) return { ok: false, code: "module_off" };
  const text = (input.text ?? "").trim();
  if (text.length > MAX_INPUT_CHARS) return { ok: false, code: "too_long" };
  const link = detectLink(text);
  const parsed: ModuleInput = link ? { kind: "url", value: link.url } : { kind: "text", value: text };
  if (parsed.kind === "text" && wordCount(text) < MIN_INPUT_WORDS) {
    return { ok: false, code: "too_short" };
  }

  const resolved = await resolveBriefOwner();
  if (!resolved) return { ok: false, code: "no_owner" };
  const ensured = await ensureBrief(resolved.owner, { locale: input.locale });
  if (!ensured.ok) return { ok: false, code: "no_brief" };

  const patch: PersistedModuleState = {
    intent: input.intent,
    step: "reading",
    input: parsed,
    locale: input.locale,
    updatedAt: new Date().toISOString(),
  };
  const saved = await updateBriefModuleState(ensured.brief.id, patch);
  if (!saved.ok) return { ok: false, code: "save_failed" };
  return { ok: true, briefId: ensured.brief.id, input: parsed };
}

/** Persist a step change the client made without new data (back, confirm). */
export async function saveOnboardingStep(input: {
  step: ModuleStep;
}): Promise<{ ok: boolean }> {
  if (!(await moduleOn())) return { ok: false };
  const resolved = await resolveBriefOwner();
  if (!resolved) return { ok: false };
  const brief = await loadBrief(resolved.owner);
  if (!brief) return { ok: false };
  const saved = await updateBriefModuleState(brief.id, {
    step: input.step,
    updatedAt: new Date().toISOString(),
  });
  return { ok: saved.ok };
}

/**
 * "Start fresh": archives the live brief (never deletes; the versions are the
 * record of what someone told us) so the next input opens a clean one.
 */
export async function resetOnboardingDraft(): Promise<{ ok: boolean }> {
  if (!(await moduleOn())) return { ok: false };
  const resolved = await resolveBriefOwner();
  if (!resolved) return { ok: false };
  const brief = await loadBrief(resolved.owner);
  if (!brief) return { ok: true };
  const archived = await archiveBrief(brief.id);
  return { ok: archived.ok };
}
