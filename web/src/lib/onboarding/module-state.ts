/**
 * Onboarding module — the state one brief carries through the shared overlay.
 *
 * Pure types and helpers shared by the client machine and the server actions.
 * The persisted copy lives in `tulala_briefs.module_state` (a JSONB written
 * after every step); the client mirrors it so a closed phone reopens where it
 * stopped and the guest → account boundary keeps the same brief.
 *
 * Nothing here is a fact. Facts (what the person said about their work) live
 * in `tulala_brief_facts` with provenance; this is progress and choices only.
 */

export type OnboardingIntent = "talent" | "business" | "unknown";

export type OnboardingPath = "talent" | "business" | "both";

export type ModuleStep =
  | "entry"
  | "listening"
  | "confirmWords"
  | "reading"
  | "tooLittle"
  | "understood"
  | "fork"
  | "question"
  | "readyToBuild"
  | "save"
  | "code"
  | "building"
  | "arrival";

export type ModuleInput = { kind: "text" | "url"; value: string };

/** Steps a reopened module may resume at. Anything else restarts at entry. */
export const RESUMABLE_STEPS: ReadonlySet<ModuleStep> = new Set<ModuleStep>([
  "confirmWords",
  "reading",
  "tooLittle",
  "understood",
  "fork",
  "question",
  "readyToBuild",
  "save",
  "code",
  "building",
  "arrival",
]);

/** The persisted shape. Every field optional: an untouched brief is `{}`. */
export type PersistedModuleState = {
  intent?: OnboardingIntent;
  step?: ModuleStep;
  input?: ModuleInput | null;
  path?: OnboardingPath | null;
  questionIndex?: number;
  locale?: "en" | "es";
  /** The chip the person tapped (business type id or talent type slug). */
  typeChoice?: { kind: "business" | "talent"; id: string; slug: string } | null;
  /** The link name chosen at "Ready to build" (checked for availability). */
  linkSlug?: string | null;
  /** "Looks right" tapped: assumed lines were accepted as they stand. */
  cardAccepted?: boolean;
  updatedAt?: string;
};

export type ResumeSnapshot = {
  /** Null when the owner has no live brief yet (auth info is still useful). */
  briefId: string | null;
  state: PersistedModuleState;
  isAuthenticated: boolean;
  email: string | null;
};

const STEPS: ReadonlySet<string> = new Set<ModuleStep>([
  "entry", "listening", "confirmWords", "reading", "tooLittle", "understood", "fork",
  "question", "readyToBuild", "save", "code", "building", "arrival",
]);

export function isModuleStep(value: unknown): value is ModuleStep {
  return typeof value === "string" && STEPS.has(value);
}

export function isOnboardingIntent(value: unknown): value is OnboardingIntent {
  return value === "talent" || value === "business" || value === "unknown";
}

/**
 * Read a persisted state defensively: the column is free JSON written by
 * earlier versions of this module, so every field is re-validated.
 */
export function parsePersistedModuleState(raw: unknown): PersistedModuleState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: PersistedModuleState = {};
  if (isOnboardingIntent(r.intent)) out.intent = r.intent;
  if (isModuleStep(r.step)) out.step = r.step;
  if (r.input && typeof r.input === "object") {
    const i = r.input as Record<string, unknown>;
    if ((i.kind === "text" || i.kind === "url") && typeof i.value === "string") {
      out.input = { kind: i.kind, value: i.value };
    }
  }
  if (r.path === "talent" || r.path === "business" || r.path === "both") out.path = r.path;
  if (typeof r.questionIndex === "number" && Number.isInteger(r.questionIndex) && r.questionIndex >= 0) {
    out.questionIndex = r.questionIndex;
  }
  if (r.locale === "en" || r.locale === "es") out.locale = r.locale;
  if (r.typeChoice && typeof r.typeChoice === "object") {
    const c = r.typeChoice as Record<string, unknown>;
    if ((c.kind === "business" || c.kind === "talent") && typeof c.id === "string" && typeof c.slug === "string") {
      out.typeChoice = { kind: c.kind, id: c.id, slug: c.slug };
    }
  }
  if (typeof r.linkSlug === "string") out.linkSlug = r.linkSlug;
  if (typeof r.cardAccepted === "boolean") out.cardAccepted = r.cardAccepted;
  if (typeof r.updatedAt === "string") out.updatedAt = r.updatedAt;
  return out;
}

/** True when a reopened module should offer "Continue" instead of a blank entry. */
export function canResume(state: PersistedModuleState): boolean {
  return !!state.step && RESUMABLE_STEPS.has(state.step) && !!state.input?.value;
}

/** Twelve words is the floor below which the AI has nothing to work with. */
export const MIN_INPUT_WORDS = 3;
export const MAX_INPUT_CHARS = 2000;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
