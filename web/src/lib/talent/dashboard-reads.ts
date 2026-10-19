/**
 * TUL-1274: talent dashboard mount reads as plain GETs.
 *
 * These four reads used to be server actions called from mount effects. A
 * server action whose request carried a cookie write (a session refresh in the
 * proxy is enough: Next 16 merges the proxy's Set-Cookie into the action's
 * mutable cookies) returns flagged "revalidated", and the client router then
 * refetches the whole RSC tree: the tab title fell back to the layout title,
 * open panels closed and clicks landed on moved elements. A fetch to a route
 * handler is outside the router's action queue, so it can never refresh the
 * tree; a refreshed session cookie still reaches the browser on the response.
 *
 * Same readers, same session guard: GET /api/talent/dashboard-reads calls the
 * existing actions server-side (see the route). Client-safe: type imports only.
 */

import type { TalentInstagramCardResult } from "@/lib/talent-integrations/instagram-actions";
import type { TalentSiteActivationState } from "@/lib/talent-site/server/site-management-types";

export type TalentDashboardReads = {
  /** loadWebsiteSettingsEnabledAction */
  "website-settings-enabled": boolean;
  /** loadTalentInstagramCardAction */
  "instagram-card": TalentInstagramCardResult;
  /** loadTalentSiteActivationStateAction */
  "site-activation": TalentSiteActivationState | null;
  /** loadMySiteLiveVerifiedAction */
  "site-live-verified": boolean | null;
};

export type TalentDashboardReadKey = keyof TalentDashboardReads;

export const TALENT_DASHBOARD_READ_KEYS: readonly TalentDashboardReadKey[] = [
  "website-settings-enabled",
  "instagram-card",
  "site-activation",
  "site-live-verified",
];

export function isTalentDashboardReadKey(value: string | null | undefined): value is TalentDashboardReadKey {
  return typeof value === "string" && (TALENT_DASHBOARD_READ_KEYS as readonly string[]).includes(value);
}

/** One GET may take this long before it rejects (a dead network, not a slow read). */
export const TALENT_DASHBOARD_READ_BUDGET_MS = 20_000;

/**
 * Reads one value. Rejects on a non-2xx, a network error, a timeout or a body
 * without `value`, so each caller keeps the fallback its old `.catch` had.
 */
export async function readTalentDashboard<K extends TalentDashboardReadKey>(
  key: K,
  fetchImpl: typeof fetch = fetch,
): Promise<TalentDashboardReads[K]> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), TALENT_DASHBOARD_READ_BUDGET_MS) : undefined;
  try {
    const res = await fetchImpl(`/api/talent/dashboard-reads?read=${encodeURIComponent(key)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller?.signal,
    });
    if (!res.ok) throw new Error(`dashboard read ${key}: HTTP ${res.status}`);
    const body = (await res.json()) as { value?: unknown } | null;
    if (!body || typeof body !== "object" || !("value" in body)) {
      throw new Error(`dashboard read ${key}: malformed body`);
    }
    return body.value as TalentDashboardReads[K];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
