/**
 * "Book with promo" code hint (TUL-1051 part C).
 *
 * A code promo cannot ride the `tl_promo` cookie (that only unlocks link
 * offers), so the widget leaves a short-lived hint in sessionStorage and the
 * booking sheet's promo panel reads it once and runs its normal apply(code).
 *
 * This is a CONVENIENCE, never an authority: the preview and the purchase both
 * re-check the code on the server. A hint that is stale, malformed or tampered
 * with just makes the panel show the usual "code not valid" message.
 * Every storage touch is wrapped: private mode and blocked site data throw.
 */

import { normalizeTypedCode } from "./public-view";

export const PROMO_CODE_HINT_KEY = "tl_promo_code";
/** 30 minutes: long enough to open the sheet, short enough not to linger. */
export const PROMO_CODE_HINT_TTL_MS = 30 * 60_000;

export type HintStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const CODE_SHAPE = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

export function sessionHintStorage(): HintStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function writePromoCodeHint(store: HintStorage | null, code: string, nowMs: number): boolean {
  const clean = normalizeTypedCode(code);
  if (!store || !CODE_SHAPE.test(clean)) return false;
  try {
    store.setItem(PROMO_CODE_HINT_KEY, JSON.stringify({ code: clean, exp: nowMs + PROMO_CODE_HINT_TTL_MS }));
    return true;
  } catch {
    return false;
  }
}

export function clearPromoCodeHint(store: HintStorage | null): void {
  try {
    store?.removeItem(PROMO_CODE_HINT_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

/** The hinted code, or null (none, malformed, or older than the TTL; stale hints are removed). */
export function readPromoCodeHint(store: HintStorage | null, nowMs: number): string | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(PROMO_CODE_HINT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const { code, exp } = parsed as { code?: unknown; exp?: unknown };
      if (typeof code === "string" && typeof exp === "number" && exp > nowMs) {
        const clean = normalizeTypedCode(code);
        if (CODE_SHAPE.test(clean)) return clean;
      }
    }
  } catch {
    // Fall through: unreadable hints are dropped below.
  }
  clearPromoCodeHint(store);
  return null;
}
