/**
 * TUL-766: the "enter your code" step survives a reload.
 *
 * The URL carries only `?step=code` (no email: never put personal data in a query string).
 * The address is kept in sessionStorage for a short window, so a reload, or coming back from the
 * mail app, lands on the code box again instead of an empty form. PURE helpers: storage and
 * clock are injected so they are unit-testable.
 */

export const CODE_STEP_PARAM = "step";
export const CODE_STEP_VALUE = "code";
export const CODE_STEP_STORAGE_KEY = "tulala.auth.codeStep";
/** Codes are short-lived; so is the remembered step. */
export const CODE_STEP_TTL_MS = 15 * 60 * 1000;

export type StepStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export function urlWithCodeStep(href: string, on: boolean): string {
  const url = new URL(href, "http://x");
  if (on) url.searchParams.set(CODE_STEP_PARAM, CODE_STEP_VALUE);
  else if (url.searchParams.get(CODE_STEP_PARAM) === CODE_STEP_VALUE) url.searchParams.delete(CODE_STEP_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function hasCodeStepParam(search: string): boolean {
  return new URLSearchParams(search.replace(/^\?/, "")).get(CODE_STEP_PARAM) === CODE_STEP_VALUE;
}

export function rememberCodeStep(storage: StepStorage, email: string, now: number): void {
  storage.setItem(CODE_STEP_STORAGE_KEY, JSON.stringify({ email, at: now }));
}

export function recallCodeStep(storage: StepStorage, now: number): string | null {
  try {
    const raw = storage.getItem(CODE_STEP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof parsed.email !== "string" || typeof parsed.at !== "number") return null;
    if (now - parsed.at > CODE_STEP_TTL_MS) {
      storage.removeItem(CODE_STEP_STORAGE_KEY);
      return null;
    }
    return parsed.email;
  } catch {
    return null;
  }
}

export function forgetCodeStep(storage: StepStorage): void {
  storage.removeItem(CODE_STEP_STORAGE_KEY);
}
