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
  type PersistedModuleState,
  type ResumeSnapshot,
} from "./module-state";

export type MachineErrorCode =
  | "too_short"
  | "too_long"
  | "offline"
  | "module_off"
  | "save_failed"
  | "no_owner"
  | "no_brief";

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
  | { type: "clearError" };

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
  };
}

/** Where "Back" goes from each step. Entry has no back (close instead). */
const BACK: Partial<Record<ModuleStep, ModuleStep>> = {
  confirmWords: "entry",
  reading: "confirmWords",
  tooLittle: "entry",
};

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
      const to = BACK[state.step];
      return to ? { ...state, step: to, error: null } : state;
    }
    case "clearError":
      return { ...state, error: null };
    default:
      return state;
  }
}
