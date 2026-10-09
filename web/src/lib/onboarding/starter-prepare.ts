/**
 * TUL-441 — starter-prepare fail state for How you work / provision.
 *
 * When starter content fails non-fatally, we record it on `agencies.settings`
 * (no migration). Compose failures already stamp `site_compose.outcome =
 * "failed"`; seed/throw paths write sibling `starter_prepare`. Pure helpers
 * only — DB I/O lives in starter-prepare.server.ts.
 */

export type StarterPrepareStatus = "failed" | "ok";

export type StarterPrepareStamp = {
  status: StarterPrepareStatus;
  at: string;
  error?: string;
};

export function parseStarterPrepare(raw: unknown): StarterPrepareStamp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== "failed" && r.status !== "ok") return null;
  const at = typeof r.at === "string" && r.at.length > 0 ? r.at : null;
  if (!at) return null;
  const error = typeof r.error === "string" && r.error.length > 0 ? r.error : undefined;
  return { status: r.status, at, error };
}

function asSettingsRecord(settings: unknown): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  return settings as Record<string, unknown>;
}

/** True when My website should show the prepare-failed banner + Reintentar. */
export function needsStarterPrepareRetry(settings: unknown): boolean {
  const s = asSettingsRecord(settings);
  if (!s) return false;
  const compose = s.site_compose;
  if (compose && typeof compose === "object" && !Array.isArray(compose)) {
    if ((compose as { outcome?: unknown }).outcome === "failed") return true;
  }
  const prep = parseStarterPrepare(s.starter_prepare);
  return prep?.status === "failed";
}

export function markStarterPrepareFailed(
  settings: unknown,
  error?: string,
  at: string = new Date().toISOString(),
): Record<string, unknown> {
  const base = asSettingsRecord(settings) ?? {};
  const stamp: StarterPrepareStamp = { status: "failed", at };
  if (error) stamp.error = error.slice(0, 500);
  return { ...base, starter_prepare: stamp };
}

/** Drop `starter_prepare` after a successful retry (compose stamp is rewritten by compose). */
export function clearStarterPrepare(settings: unknown): Record<string, unknown> {
  const base = { ...(asSettingsRecord(settings) ?? {}) };
  delete base.starter_prepare;
  return base;
}

/**
 * Pure retry planner — what the server action should run. Tests simulate
 * compose failure → retry plan → cleared state without hitting the DB.
 */
export type StarterPrepareRetryPlan =
  | { kind: "compose"; briefId: string }
  | { kind: "seed" }
  | { kind: "noop" };

export function planStarterPrepareRetry(input: {
  settings: unknown;
  briefId: string | null;
}): StarterPrepareRetryPlan {
  if (!needsStarterPrepareRetry(input.settings)) return { kind: "noop" };
  if (input.briefId) return { kind: "compose", briefId: input.briefId };
  return { kind: "seed" };
}

/** After a successful compose/seed, settings no longer need the banner. */
export function settingsAfterSuccessfulRetry(
  settings: unknown,
  nextSiteComposeOutcome: "composed" | "fallback_used" | "missing_logo" | "failed" | null,
): Record<string, unknown> {
  const cleared = clearStarterPrepare(settings);
  if (nextSiteComposeOutcome == null) return cleared;
  const prev =
    cleared.site_compose && typeof cleared.site_compose === "object" && !Array.isArray(cleared.site_compose)
      ? (cleared.site_compose as Record<string, unknown>)
      : {};
  return {
    ...cleared,
    site_compose: { ...prev, outcome: nextSiteComposeOutcome },
  };
}
