/**
 * TUL-812: the wizard's step <-> browser history wiring, as a small controller
 * over injected browser functions so a whole session (forward, in-app Back,
 * browser Back, reload) is unit tested against a fake History.
 *
 * ROOT CAUSE it fixes: the first version wrote history entries with
 * `pushState(window.history.state, ...)`. That state already carries Next's
 * `__NA` marker, which makes Next's patched pushState/replaceState skip its own
 * bookkeeping. Next's router therefore never learned the `?step=` URL, and its
 * HistoryUpdater rewrote the address bar back to its stale canonical URL after
 * every router state change (each server action). The URL then stopped matching
 * the screen and the entries Back walked through carried the wrong `?step=`.
 * Entries are now written with a FRESH state object (so Next adopts the URL) and
 * the step also rides in `history.state` (`tlStep`), so Back does not depend on
 * the URL alone.
 */
import { planStepSync, stepForPopTarget, urlWithStep } from "./step-url";

export const HISTORY_STEP_KEY = "tlStep";
/** Marker the module puts on its root until the resume lookup answered (no URL change yet). */
export const LOADING_STEP = "loading";

/** A fresh history state for a step; keeps our own keys, never Next's (`__NA`, tree), so Next adopts the URL. */
export function stepHistoryState(step: string | null): Record<string, unknown> {
  return step ? { [HISTORY_STEP_KEY]: step } : {};
}

/** The step stored on a history entry, if we wrote one. */
export function stepOfHistoryState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const v = (state as Record<string, unknown>)[HISTORY_STEP_KEY];
  return typeof v === "string" && /^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(v) ? v : null;
}

export type StepHistoryDeps = {
  /** The wizard's visible step (`data-onboarding-step`), or null. */
  currentStep: () => string | null;
  href: () => string;
  pushState: (state: Record<string, unknown>, url: string) => void;
  replaceState: (state: Record<string, unknown>, url: string) => void;
  back: () => void;
  /** Show an earlier step (the wizard's own state change). */
  goto: (step: string) => void;
};

export function createStepHistory(deps: StepHistoryDeps) {
  let stack: string[] = [];
  const urlStep = () => {
    try {
      return new URL(deps.href()).searchParams.get("step");
    } catch {
      return null;
    }
  };
  return {
    /** The visible step changed (or the page just mounted): make the address bar follow. */
    sync() {
      const step = deps.currentStep();
      if (step === LOADING_STEP) return;
      const plan = planStepSync(stack, step);
      stack = plan.stack;
      if (plan.op === "back") {
        deps.back();
        return;
      }
      if (plan.op === "none") return;
      const next = urlWithStep(deps.href(), step);
      if (next === deps.href()) return;
      if (plan.op === "push") deps.pushState(stepHistoryState(step), next);
      else deps.replaceState(stepHistoryState(step), next);
    },
    /** The browser moved to another entry (Back / Forward). `state` is that entry's history state. */
    onPop(state: unknown) {
      const current = deps.currentStep();
      if (!current || current === LOADING_STEP) return;
      const target = stepOfHistoryState(state) ?? urlStep();
      const to = stepForPopTarget(current, target);
      if (to) {
        const at = stack.lastIndexOf(to);
        stack = at >= 0 ? stack.slice(0, at + 1) : [...stack, to];
        deps.goto(to);
      } else if (target !== current) {
        // The browser cannot take us there (later screen, locked screen, unknown step): the URL follows the screen.
        deps.replaceState(stepHistoryState(current), urlWithStep(deps.href(), current));
      }
    },
  };
}
