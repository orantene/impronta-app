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
import { archiveBrief, ensureBrief, loadBrief, recordFacts } from "@/lib/tulala/brief-store.server";
import { updateBriefModuleState } from "@/lib/tulala/brief-module-state.server";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { MAX_INPUT_CHARS, MIN_INPUT_WORDS, parsePersistedModuleState, wordCount, type ModuleInput, type ModuleStep, type OnboardingIntent, type PersistedModuleState, type ResumeSnapshot, isVisualDirection, type VisualDirection } from "@/lib/onboarding/module-state";
import { detectLink } from "@/lib/tulala/detect-url";
import { understandBrief, understandingFor, type UnderstandResult } from "@/lib/onboarding/understand.server";
import {
  hoursFromPreset,
  normalizeWhatsapp,
  type HoursPresetId,
  type ModuleQuestionId,
} from "@/lib/onboarding/module-questions";
import type { TypeChipProposal } from "@/lib/onboarding/type-chip";
import type { Understanding } from "@/lib/onboarding/understanding";
import { checkSubdomainAvailability } from "@/app/(marketing)/get-started/actions";
import { normalizeWorkspaceSlugCandidate } from "@/lib/saas/workspace-signup";
import { validateFactValue } from "@/lib/tulala/fact-keys";
import type { OnboardingPath } from "@/lib/onboarding/module-state";

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
  // A new sentence is a new start. An owner's live brief may carry facts
  // from an earlier attempt or from another flow (2026-09-17: the old agent
  // page's "Café Río Barbería" surfaced under a fitness-studio sentence).
  // Archive it (never delete) and begin clean; resume never comes through
  // here, so a person continuing their own brief is untouched.
  const existing = await loadBrief(resolved.owner);
  if (existing) {
    const previous = parsePersistedModuleState(existing.moduleState);
    const hadContent = existing.facts.length > 0 || !!previous.input;
    const sameInput = previous.input?.value === parsed.value;
    if (hadContent && !sameInput) await archiveBrief(existing.id);
  }
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

// ─── Phase 3 · understanding, edits, questions, link ──────────────────────────


export type CardPayload = {
  briefId: string;
  understanding: Understanding;
  chip: TypeChipProposal | null;
  state: PersistedModuleState;
};

export type CardResult =
  | { ok: true; card: CardPayload }
  | ModuleActionError
  | { ok: false; code: "ai"; message: string; understandCode: Extract<UnderstandResult, { ok: false }>["code"] };

type Owned =
  | { error: ModuleActionError; resolved?: undefined; brief?: undefined; state?: undefined }
  | { error?: undefined; resolved: NonNullable<Awaited<ReturnType<typeof resolveBriefOwner>>>; brief: NonNullable<Awaited<ReturnType<typeof loadBrief>>>; state: PersistedModuleState };

async function ownedBrief(): Promise<Owned> {
  if (!(await moduleOn())) return { error: { ok: false, code: "module_off" } };
  const resolved = await resolveBriefOwner();
  if (!resolved) return { error: { ok: false, code: "no_owner" } };
  const brief = await loadBrief(resolved.owner);
  if (!brief) return { error: { ok: false, code: "no_brief" } };
  return { resolved, brief, state: parsePersistedModuleState(brief.moduleState) };
}

async function cardFor(briefId: string, state: PersistedModuleState, brief: Parameters<typeof understandingFor>[0]["brief"]): Promise<CardPayload> {
  const { understanding, chip } = await understandingFor({
    brief,
    intent: state.intent ?? "unknown",
    userPath: state.path ?? null,
  });
  return { briefId, understanding, chip, state };
}

/**
 * Runs the understand step on the stored input (sentence or link), records
 * the facts and returns the card. Idempotent: calling it again re-reads the
 * words (a second model call) only when the card has no facts yet.
 */
export async function understandOnboardingInput(): Promise<CardResult> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  const { resolved, brief, state } = got;
  const input = state.input;
  if (!input) return { ok: false, code: "no_brief" };

  if (brief.facts.length === 0) {
    const session = await getCachedActorSession();
    const result = await understandBrief({
      owner: resolved.owner,
      brief,
      intent: state.intent ?? "unknown",
      userPath: state.path ?? null,
      locale: state.locale ?? "en",
      text: input.kind === "text" ? input.value : undefined,
      url: input.kind === "url" ? input.value : undefined,
      scope: { sessionId: session.user?.id ?? resolved.guestSessionId ?? brief.id, userId: session.user?.id ?? null },
    });
    if (!result.ok) return { ok: false, code: "ai", message: result.message, understandCode: result.code };
    const nextStep: ModuleStep = result.understanding.tooLittle ? "tooLittle" : "understood";
    await updateBriefModuleState(brief.id, { step: nextStep, updatedAt: new Date().toISOString() });
    return { ok: true, card: { briefId: brief.id, understanding: result.understanding, chip: result.chip, state: { ...state, step: nextStep } } };
  }
  return { ok: true, card: await cardFor(brief.id, state, brief) };
}

/** The card as it stands (resume, after edits). No model call. */
export async function loadOnboardingCard(): Promise<CardResult> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  return { ok: true, card: await cardFor(got.brief.id, got.state, got.brief) };
}

/** An inline edit on the card: the person's own words, confirmed. */
export async function editUnderstoodFact(input: { factKey: string; value: string | string[] }): Promise<CardResult> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  const check = validateFactValue(input.factKey, input.value);
  if (!check.ok) return { ok: false, code: "save_failed" };
  await recordFacts(got.brief.id, [{ factKey: input.factKey, value: check.value, source: "user_stated", status: "confirmed", confidence: 1 }]);
  const brief = (await loadBrief(got.resolved.owner)) ?? got.brief;
  return { ok: true, card: await cardFor(brief.id, got.state, brief) };
}

/** The fork: for you / the business / both. A choice, not a fact. */
export async function chooseOnboardingPath(input: { path: OnboardingPath }): Promise<CardResult> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  const saved = await updateBriefModuleState(got.brief.id, { path: input.path, updatedAt: new Date().toISOString() });
  const state = { ...got.state, path: input.path };
  if (!saved.ok) return { ok: false, code: "save_failed" };
  return { ok: true, card: await cardFor(got.brief.id, state, got.brief) };
}

export type EssentialsAnswer = {
  /** Picked from the taxonomy / catalogue (id set) or typed as "Other" (id empty). Null = unchanged. */
  type?: { kind: "talent" | "business"; id: string; slug: string; label: string } | null;
  city?: { id: string | null; slug: string; name: string; countryIso2: string } | null;
  name?: string | null;
  services?: string[] | null;
  hoursPreset?: HoursPresetId | null;
  hoursCustom?: string[] | null;
  whatsapp?: string | null;
};

/**
 * The essentials screen: every detail the site needs, saved in one call.
 * Only fields the person set are written (null / undefined = leave what the
 * words gave). What you do and city are required when the card lacks them;
 * the screen enforces that, and this re-checks it against the brief.
 */
export async function saveOnboardingEssentials(input: EssentialsAnswer): Promise<CardResult | { ok: false; code: "invalid_whatsapp" | "missing_required" }> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  const locale = got.state.locale ?? "en";
  const facts: Parameters<typeof recordFacts>[1] = [];
  const statePatch: PersistedModuleState = { updatedAt: new Date().toISOString() };
  const path = got.state.path ?? "talent";
  const business = path !== "talent";

  if (input.type) {
    const label = input.type.label.trim();
    if (!label) return { ok: false, code: "missing_required" };
    if (input.type.id) statePatch.typeChoice = { kind: input.type.kind, id: input.type.id, slug: input.type.slug };
    facts.push({ factKey: input.type.kind === "business" ? "work.industry" : "work.discipline", value: label, source: "user_stated", status: "confirmed", confidence: 1 });
  }
  if (input.city) {
    const city = input.city.name.trim();
    if (!city) return { ok: false, code: "missing_required" };
    facts.push({ factKey: "person.city", value: city, source: "user_stated", status: "confirmed", confidence: 1 });
    if (/^[A-Z]{2}$/.test(input.city.countryIso2)) facts.push({ factKey: "person.country", value: input.city.countryIso2, source: "user_stated", status: "confirmed", confidence: 1 });
  }
  if (typeof input.name === "string" && input.name.trim()) {
    facts.push({ factKey: business ? "business.name" : "person.professional_name", value: input.name.trim(), source: "user_stated", status: "confirmed", confidence: 1 });
    if (path === "both") facts.push({ factKey: "person.professional_name", value: input.name.trim(), source: "user_stated", status: "confirmed", confidence: 1 });
  }
  if (input.services) {
    const list = input.services.map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (list.length) facts.push({ factKey: "work.services", value: list, source: "user_stated", status: "confirmed", confidence: 1 });
  }
  if (input.hoursPreset) facts.push({ factKey: "business.hours", value: hoursFromPreset(input.hoursPreset, locale), source: "user_stated", status: "confirmed", confidence: 1 });
  else if (input.hoursCustom && input.hoursCustom.length) facts.push({ factKey: "business.hours", value: input.hoursCustom.map((l) => l.trim()).filter(Boolean), source: "user_stated", status: "confirmed", confidence: 1 });
  if (typeof input.whatsapp === "string" && input.whatsapp.trim()) {
    const normalized = normalizeWhatsapp(input.whatsapp);
    if (!normalized) return { ok: false, code: "invalid_whatsapp" };
    facts.push({ factKey: "presence.whatsapp", value: normalized, source: "user_stated", status: "confirmed", confidence: 1 });
  }

  if (facts.length) await recordFacts(got.brief.id, facts);
  const brief = (await loadBrief(got.resolved.owner)) ?? got.brief;
  const card = await cardFor(brief.id, { ...got.state, ...statePatch }, brief);
  // Required on this screen: what you do and where, whatever the words said.
  const missing = card.understanding.lines.filter((l) => (l.id === "what" || l.id === "kind" || l.id === "city") && l.status === "missing");
  if (missing.some((l) => l.id === "city") || (missing.length > 0 && !business && missing.some((l) => l.id === "what")) || (business && missing.some((l) => l.id === "kind"))) {
    return { ok: false, code: "missing_required" };
  }
  statePatch.step = business ? "style" : "readyToBuild";
  const saved = await updateBriefModuleState(got.brief.id, statePatch as Record<string, unknown>);
  if (!saved.ok) return { ok: false, code: "save_failed" };
  return { ok: true, card };
}

/** The style tile: stored as the brand.visual_direction fact the composer reads, and as the module's choice. */
export async function saveOnboardingStyle(input: { direction: VisualDirection; notes?: string | null }): Promise<{ ok: boolean }> {
  if (!isVisualDirection(input.direction)) return { ok: false };
  const got = await ownedBrief();
  if (got.error) return { ok: false };
  const facts: Parameters<typeof recordFacts>[1] = [{ factKey: "brand.style", value: input.direction, source: "user_stated", status: "confirmed", confidence: 1 }];
  const notes = (input.notes ?? "").trim().slice(0, 300);
  // Free words about the look (colours, mood, brands they like): kept as a
  // fact so the composer's copy pass and a later design-brief step can read it.
  if (notes) facts.push({ factKey: "brand.style_notes", value: notes, source: "user_stated", status: "confirmed", confidence: 1 });
  await recordFacts(got.brief.id, facts);
  const saved = await updateBriefModuleState(got.brief.id, { styleChoice: input.direction, step: "readyToBuild", updatedAt: new Date().toISOString() });
  return { ok: saved.ok };
}

/** "Looks right": accept the assumed lines as they stand and move on. */
export async function acceptUnderstoodCard(): Promise<{ ok: boolean; nextStep: ModuleStep; followUps: ModuleQuestionId[] }> {
  const got = await ownedBrief();
  if (got.error) return { ok: false, nextStep: "understood", followUps: [] };
  const card = await cardFor(got.brief.id, got.state, got.brief);
  const followUps = card.understanding.followUps;
  // One essentials screen after the card (2026-09-17): every missing detail
  // on one page, prefilled, instead of a question per screen.
  const nextStep: ModuleStep = followUps[0] === "fork" ? "fork" : "essentials";
  // The path the card showed is the path we build, unless a fork follows.
  const pathPatch = nextStep === "fork" ? {} : { path: card.understanding.path };
  const saved = await updateBriefModuleState(got.brief.id, { step: nextStep, cardAccepted: true, questionIndex: 0, ...pathPatch, updatedAt: new Date().toISOString() });
  return { ok: saved.ok, nextStep, followUps };
}

export type LinkCheck = { slug: string; available: boolean; reason?: string; suggestions?: string[] };

/** The link name at "Ready to build": normalised, checked, remembered. */
export async function setOnboardingLink(input: { slug: string }): Promise<{ ok: true; link: LinkCheck } | ModuleActionError> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  const slug = normalizeWorkspaceSlugCandidate(input.slug);
  if (!slug) return { ok: true, link: { slug: "", available: false, reason: "empty" } };
  const check = await checkSubdomainAvailability(slug);
  if (check.available) await updateBriefModuleState(got.brief.id, { linkSlug: slug, updatedAt: new Date().toISOString() });
  return { ok: true, link: { slug, ...check } };
}

/** The stored build record (resume on the building / arrival screens). */
export async function getOnboardingBuildStatus(): Promise<{ ok: true; build: Record<string, unknown> | null } | ModuleActionError> {
  const got = await ownedBrief();
  if (got.error) return got.error;
  return { ok: true, build: got.state.build ?? null };
}
