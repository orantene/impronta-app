/**
 * Onboarding module — the client-side step machine, as a pure reducer so the
 * transitions are unit-tested without React.
 *
 * Phase 2 covers entry → listening → confirmWords → reading and resume.
 * Later phases add the reasoning, account, build and arrival transitions to
 * the same reducer; the step vocabulary is fixed in `module-state.ts`.
 */

import {
  canResume,
  type ModuleInput,
  type ModuleStep,
  type OnboardingIntent,
  type OnboardingPath,
  type PersistedModuleState,
  type ResumeSnapshot,
} from "./module-state";
import type { ModuleQuestionId } from "./module-questions";
import type { TypeChipProposal } from "./type-chip";
import type { Understanding } from "./understanding";

export type MachineErrorCode =
  | "too_short"
  | "too_long"
  | "offline"
  | "module_off"
  | "save_failed"
  | "no_owner"
  | "no_brief"
  | "ai_off"
  | "rate_limit"
  | "import_failed"
  | "failed"
  | "invalid_whatsapp";

export type MachineState = {
  intent: OnboardingIntent;
  step: ModuleStep;
  /** The text box on the entry / confirm screens. */
  text: string;
  /** What was sent (after the server accepted it). */
  input: ModuleInput | null;
  briefId: string | null;
  /** A resumable snapshot found on open; cleared once chosen. */
  resume: ResumeSnapshot | null;
  busy: boolean;
  error: MachineErrorCode | null;
  /** True while the person is dictating; the examples pause. */
  dictating: boolean;
  isAuthenticated: boolean;
  email: string | null;
  /** Phase 3: the understood card and the follow-up cursor. */
  understanding: Understanding | null;
  chip: TypeChipProposal | null;
  followUps: ModuleQuestionId[];
  questionIndex: number;
  linkSlug: string | null;
  linkAvailable: boolean | null;
  linkSuggestions: string[];
  /** Phase 4: the address a code was sent to; a message for the code screen. */
  codeEmail: string | null;
  accountMessage: string | null;
  accountNotice: string | null;
};

export type MachineEvent =
  | { type: "opened"; intent: OnboardingIntent }
  | { type: "resumeLoaded"; snapshot: ResumeSnapshot | null }
  | { type: "resumeContinue" }
  | { type: "resumeFresh" }
  | { type: "textChanged"; text: string }
  | { type: "dictation"; on: boolean }
  | { type: "reviewWords" }
  | { type: "editWords" }
  | { type: "sendStarted" }
  | { type: "sendAccepted"; briefId: string; input: ModuleInput }
  | { type: "sendFailed"; code: MachineErrorCode }
  | { type: "back" }
  | { type: "clearError" }
  | { type: "cardLoaded"; understanding: Understanding; chip: TypeChipProposal | null; step?: ModuleStep }
  | { type: "cardFailed"; code: MachineErrorCode }
  | { type: "cardAccepted"; nextStep: ModuleStep; followUps: ModuleQuestionId[] }
  | { type: "pathChosen"; understanding: Understanding; chip: TypeChipProposal | null; path: OnboardingPath }
  | { type: "questionAnswered"; understanding: Understanding; chip: TypeChipProposal | null }
  | { type: "questionSkipped" }
  | { type: "jumpToQuestion"; questionId: ModuleQuestionId }
  | { type: "linkChecked"; slug: string; available: boolean; suggestions: string[] }
  | { type: "toStep"; step: ModuleStep }
  | { type: "codeSent"; email: string; notice: string | null }
  | { type: "accountFailed"; message: string }
  | { type: "authed"; email: string | null };

export function initialMachineState(intent: OnboardingIntent = "unknown"): MachineState {
  return {
    intent,
    step: "entry",
    text: "",
    input: null,
    briefId: null,
    resume: null,
    busy: false,
    error: null,
    dictating: false,
    isAuthenticated: false,
    email: null,
    understanding: null,
    chip: null,
    followUps: [],
    questionIndex: 0,
    linkSlug: null,
    linkAvailable: null,
    linkSuggestions: [],
    codeEmail: null,
    accountMessage: null,
    accountNotice: null,
  };
}

/** Where "Back" goes from each step. Entry has no back (close instead). */
const BACK: Partial<Record<ModuleStep, ModuleStep>> = {
  confirmWords: "entry",
  reading: "confirmWords",
  tooLittle: "entry",
  fork: "understood",
  question: "understood",
  readyToBuild: "understood",
  save: "readyToBuild",
  code: "save",
};

/** After a question: the next one, or ready to build. */
function afterQuestion(state: MachineState): MachineState {
  const next = state.questionIndex + 1;
  const remaining = state.followUps.filter((q) => q !== "fork");
  if (next < remaining.length) return { ...state, questionIndex: next, step: "question", busy: false, error: null };
  return { ...state, questionIndex: next, step: "readyToBuild", busy: false, error: null };
}

export function reduceMachine(state: MachineState, event: MachineEvent): MachineState {
  switch (event.type) {
    case "opened":
      return { ...initialMachineState(event.intent) };
    case "resumeLoaded": {
      const snapshot = event.snapshot;
      const base: MachineState = {
        ...state,
        isAuthenticated: snapshot?.isAuthenticated ?? false,
        email: snapshot?.email ?? null,
      };
      if (!snapshot || !snapshot.briefId || !canResume(snapshot.state)) return base;
      return { ...base, resume: snapshot };
    }
    case "resumeContinue": {
      const snap = state.resume;
      if (!snap) return state;
      const s: PersistedModuleState = snap.state;
      return {
        ...state,
        resume: null,
        briefId: snap.briefId,
        intent: s.intent ?? state.intent,
        input: s.input ?? null,
        text: s.input?.value ?? "",
        step: s.step ?? "entry",
        questionIndex: s.questionIndex ?? 0,
        linkSlug: s.linkSlug ?? null,
      };
    }
    case "resumeFresh":
      return { ...initialMachineState(state.intent), isAuthenticated: state.isAuthenticated, email: state.email };
    case "textChanged":
      return { ...state, text: event.text, error: null };
    case "dictation":
      return { ...state, dictating: event.on, step: event.on ? "listening" : state.step === "listening" ? "entry" : state.step };
    case "reviewWords":
      return state.text.trim() ? { ...state, step: "confirmWords", dictating: false } : state;
    case "editWords":
      return { ...state, step: "entry" };
    case "sendStarted":
      return { ...state, busy: true, error: null };
    case "sendAccepted":
      return { ...state, busy: false, briefId: event.briefId, input: event.input, step: "reading" };
    case "sendFailed":
      return { ...state, busy: false, error: event.code, step: event.code === "too_short" ? "tooLittle" : state.step };
    case "back": {
      if (state.step === "question" && state.questionIndex > 0) {
        return { ...state, questionIndex: state.questionIndex - 1, error: null };
      }
      const to = BACK[state.step];
      return to ? { ...state, step: to, error: null, questionIndex: 0 } : state;
    }
    case "clearError":
      return { ...state, error: null };
    case "cardLoaded": {
      const followUps = event.understanding.followUps;
      let step: ModuleStep = event.step ?? (event.understanding.tooLittle ? "tooLittle" : state.step === "reading" ? "understood" : state.step);
      // Resuming mid-questions: the answered ones are no longer missing, so
      // the remaining list starts at 0; none left means ready to build.
      const remaining = followUps.filter((q) => q !== "fork");
      if (step === "question" && remaining.length === 0) step = "readyToBuild";
      return {
        ...state,
        busy: false,
        error: null,
        understanding: event.understanding,
        chip: event.chip,
        followUps,
        questionIndex: step === "question" ? 0 : state.questionIndex,
        step,
      };
    }
    case "cardFailed":
      return { ...state, busy: false, error: event.code, step: event.code === "ai_off" ? state.step : state.step };
    case "cardAccepted":
      return { ...state, busy: false, followUps: event.followUps, questionIndex: 0, step: event.nextStep };
    case "pathChosen": {
      const followUps = event.understanding.followUps.filter((q) => q !== "fork");
      return {
        ...state,
        busy: false,
        understanding: event.understanding,
        chip: event.chip,
        followUps,
        questionIndex: 0,
        step: followUps.length ? "question" : "readyToBuild",
      };
    }
    case "questionAnswered":
      return afterQuestion({ ...state, understanding: event.understanding, chip: event.chip });
    case "questionSkipped":
      return afterQuestion(state);
    case "jumpToQuestion": {
      const remaining: ModuleQuestionId[] = state.followUps.filter((q) => q !== "fork");
      const idx = remaining.indexOf(event.questionId);
      if (idx < 0) return state;
      return { ...state, step: "question", questionIndex: idx, error: null };
    }
    case "linkChecked":
      return { ...state, linkSlug: event.slug, linkAvailable: event.available, linkSuggestions: event.suggestions };
    case "toStep":
      return { ...state, step: event.step, error: null, busy: false, accountMessage: null };
    case "codeSent":
      return { ...state, busy: false, step: "code", codeEmail: event.email, accountMessage: null, accountNotice: event.notice };
    case "accountFailed":
      return { ...state, busy: false, accountMessage: event.message, accountNotice: null };
    case "authed":
      return { ...state, busy: false, isAuthenticated: true, email: event.email ?? state.email, step: "building", accountMessage: null, accountNotice: null };
    default:
      return state;
  }
}
