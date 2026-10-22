/**
 * TUL-812: the wizard's current step mirrored into the address bar as `?step=`,
 * so the URL says where you are and a copied or refreshed link carries it.
 * Progress itself is restored by the saved-progress resume, not by the URL.
 * Pure, so it is unit tested.
 */
import { isModuleStep, type ModuleStep } from "./module-state";

const STEP = /^[A-Za-z][A-Za-z0-9-]{0,40}$/;

export function urlWithStep(href: string, step: string | null | undefined): string {
  const url = new URL(href);
  if (step && STEP.test(step)) url.searchParams.set("step", step);
  else url.searchParams.delete("step");
  return url.toString();
}

/** TUL-812: StartFlow asks the wizard to show an earlier step (browser Back); detail = { step }. */
export const WIZARD_GOTO_EVENT = "tulala:wizard-goto";

/** Screens that are passing states: they rewrite their history entry instead of adding one. */
const TRANSIENT = new Set(["listening", "reading", "building"]);
/** Screens a Back press must never leave (work in flight, or the finished page). */
const LOCKED = new Set(["reading", "building", "arrival"]);
/** Forward order of the screens a person can step back through. */
const ORDER = ["choose", "entry", "confirmWords", "tooLittle", "understood", "question", "essentials", "setup", "style", "readyToBuild", "save", "code"];
const MAX_STACK = 60;

export type HistoryOp = "push" | "replace" | "back" | "none";

/**
 * TUL-812: how the address bar follows a step change. `stack` mirrors the
 * entries this page pushed. A forward step pushes (so Back works); a passing
 * screen rewrites its entry; the in-app Back button, which returns to the
 * previous entry's step, pops it so the two Backs agree.
 */
export function planStepSync(stack: readonly string[], step: string | null | undefined): { op: HistoryOp; stack: string[] } {
  if (!step || !STEP.test(step)) return { op: "replace", stack: [...stack] };
  if (stack.length === 0) return { op: "replace", stack: [step] };
  const last = stack[stack.length - 1];
  if (last === step) return { op: "none", stack: [...stack] };
  if (TRANSIENT.has(step)) return { op: "replace", stack: [...stack.slice(0, -1), step] };
  if (stack.length > 1 && stack[stack.length - 2] === step) return { op: "back", stack: stack.slice(0, -1) };
  return { op: "push", stack: [...stack, step].slice(-MAX_STACK) };
}

/**
 * TUL-812: where "Continue" lands. A `?step=` deep link wins when it names a
 * settled screen at or before the saved one (the data is kept, so going back
 * is safe); a step past the saved progress, an unknown name or a locked
 * screen falls back to the saved step.
 */
export function resumeLandingStep(saved: string | null | undefined, urlStep: string | null | undefined): string | null {
  if (!saved) return null;
  if (!urlStep || LOCKED.has(saved) || LOCKED.has(urlStep)) return saved;
  const to = TRANSIENT.has(urlStep) ? "entry" : urlStep;
  const from = ORDER.indexOf(saved);
  const dest = ORDER.indexOf(to);
  if (from < 0 || dest < 0 || dest > from) return saved;
  return to;
}

/** TUL-812: `resumeLandingStep` as a module step (undefined = keep the saved one). */
export function landingStep(urlStep: string | null, saved: ModuleStep | undefined): ModuleStep | undefined {
  const to = resumeLandingStep(saved, urlStep);
  return isModuleStep(to) ? to : undefined;
}

/** TUL-812: the `?step=` of the page URL, or null (server render, bad URL). */
export function urlStepOfLocation(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const v = new URL(href).searchParams.get("step");
    return v && STEP.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * TUL-812: the browser moved to `target`. Returns the step to show, or null
 * when the wizard stays where it is (the caller then rewrites the URL back).
 * Only earlier, settled screens are reachable by Back.
 */
export function stepForPopTarget(current: string | null | undefined, target: string | null | undefined): string | null {
  if (!current || !target || current === target) return null;
  if (LOCKED.has(current)) return null;
  const to = TRANSIENT.has(target) ? "entry" : target;
  const from = ORDER.indexOf(current);
  const dest = ORDER.indexOf(to);
  if (from < 0 || dest < 0 || dest >= from) return null;
  return to;
}
