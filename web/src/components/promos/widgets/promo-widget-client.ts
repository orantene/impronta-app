/**
 * Browser-side helpers for the promo widgets (TUL-1051 part B). Every storage
 * touch is wrapped: Safari private mode, blocked site data and previews throw
 * on access, and a widget must never be the thing that breaks a page.
 */

import type { CSSProperties } from "react";

import type { PromoEventKind } from "@/lib/promos/share/events";
import { capAllows, nextCapRecord, parseCapRecord, type WidgetViewer } from "@/lib/promos/widgets/model";
import type { PromoWidgetFrequency } from "@/lib/promos/widgets/types";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function browserStorage(kind: "local" | "session"): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGet(store: StorageLike | null, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeSet(store: StorageLike | null, key: string, value: string): boolean {
  try {
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

const VISIT_KEY = "tl_pw_visits";
const VIEWER_KEY = "tl_pw_viewer";

/**
 * Who is looking. "Returning" means this browser has seen a promo widget in an
 * earlier visit (the first look counts as new and is remembered). The answer is
 * cached for the tab so a re-render or route change cannot flip a first-time
 * visitor to "returning" mid-visit. Signed-in is only what the site told us:
 * unknown is treated as a guest.
 */
export function readViewer(
  stores: { local: StorageLike | null; session: StorageLike | null },
  signedInHint: boolean | null,
): WidgetViewer {
  const cached = safeGet(stores.session, VIEWER_KEY);
  let returning: boolean;
  if (cached === "1" || cached === "0") {
    returning = cached === "1";
  } else {
    returning = safeGet(stores.local, VISIT_KEY) !== null;
    if (!returning) safeSet(stores.local, VISIT_KEY, String(Date.now()));
    safeSet(stores.session, VIEWER_KEY, returning ? "1" : "0");
  }
  return { returning, signedIn: signedInHint === true };
}

export type PopupCap = { allowed: (nowMs: number) => boolean; record: (nowMs: number) => void };

/** The pop-up's frequency cap: `session` lives in sessionStorage, the rest in localStorage. */
export function popupCap(
  frequency: PromoWidgetFrequency | undefined,
  nodeId: string,
  stores: { local: StorageLike | null; session: StorageLike | null },
): PopupCap {
  const key = `tl_pw_cap:${nodeId}`;
  const store = (frequency ?? "session") === "session" ? stores.session : stores.local;
  return {
    allowed: (nowMs) => (frequency === "always" ? true : capAllows(frequency, parseCapRecord(safeGet(store, key)), nowMs)),
    record: (nowMs) => {
      if (frequency === "always") return;
      safeSet(store, key, JSON.stringify(nextCapRecord(parseCapRecord(safeGet(store, key)), nowMs)));
    },
  };
}

/** Fire-and-forget analytics. `link_open` also pins the promo (httpOnly cookie, set by the response). */
export function postPromoEvent(promoId: string, kind: PromoEventKind): Promise<void> {
  return fetch("/api/promos/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promoId, kind, via: "site" }),
    keepalive: true,
    credentials: "same-origin",
  }).then(
    () => undefined,
    () => undefined,
  );
}

/** One `view` per promo per tab session: a re-render or a route change is not a new look. */
export function viewOnce(promoId: string, session: StorageLike | null): void {
  const key = `tl_pw_view:${promoId}`;
  if (safeGet(session, key) !== null) return;
  safeSet(session, key, "1");
  void postPromoEvent(promoId, "view");
}

/** The site tokens a fixed widget must carry with it when it is portalled out of the themed tree. */
export const THEME_VARS = [
  "--token-color-ink", "--token-color-background", "--token-color-accent", "--token-color-primary",
  "--token-color-on-accent", "--token-color-surface-raised", "--token-color-muted", "--token-color-line",
  "--site-radius-md", "--site-body-font", "--site-heading-font",
] as const;

export function readThemeVars(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const cs = getComputedStyle(el);
    for (const name of THEME_VARS) {
      const v = cs.getPropertyValue(name).trim();
      if (v) out[name] = v;
    }
  } catch {
    // No computed style (detached node): the CSS fallbacks apply.
  }
  return out;
}

/** Custom properties as an inline style. React accepts `--x` keys at runtime; the type has no way to say so. */
export function cssVarStyle(vars: Record<string, string>): CSSProperties {
  return vars as unknown as CSSProperties;
}
