/**
 * TUL-818: the dashboard "Website live" badge is a claim about the real page.
 * It reads the verified state (published row AND the address answered with the
 * person's page), never the optimistic published flag alone. Pure.
 */

export type LiveBadgeState = "live" | "checking" | "not_live";

export function liveBadgeState(input: { published: boolean; verified: boolean | null }): LiveBadgeState {
  if (!input.published) return "not_live";
  return input.verified === true ? "live" : "checking";
}

/**
 * Per-URL memo for the server-side address check, so the badge does not fetch
 * the site on every route change. A pass is kept longer than a failure, so a
 * site that just went live flips to "live" quickly.
 */
export function createLiveVerifyMemo(opts: { okTtlMs: number; failTtlMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { ok: boolean; at: number }>();
  return {
    async get(url: string, check: () => Promise<boolean>): Promise<boolean> {
      const hit = entries.get(url);
      if (hit && now() - hit.at < (hit.ok ? opts.okTtlMs : opts.failTtlMs)) return hit.ok;
      const ok = await check();
      entries.set(url, { ok, at: now() });
      return ok;
    },
    forget(url: string): void {
      entries.delete(url);
    },
  };
}
