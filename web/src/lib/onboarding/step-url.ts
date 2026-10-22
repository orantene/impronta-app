/**
 * TUL-812: the wizard's current step mirrored into the address bar as `?step=`,
 * so the URL says where you are and a copied or refreshed link carries it.
 * Progress itself is restored by the saved-progress resume, not by the URL.
 * Pure, so it is unit tested.
 */
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
