/**
 * plan-intent.ts: the paid plan a visitor picked on /pricing, carried through
 * the /start front door (TUL-828). Pure, so it is unit tested.
 *
 * `/start?plan=<PlanKey>&interval=<month|year>` is untrusted. Only the paid
 * talent plans survive; anything else (free, workspace plans, junk) is ignored
 * and the normal flow runs. Checkout re-validates everything server-side
 * (`startTalentUpgrade`), this only decides whether to offer the upgrade.
 */

export const PAID_TALENT_PLAN_KEYS = ["talent_pro", "talent_portfolio"] as const;
export type PaidTalentPlanKey = (typeof PAID_TALENT_PLAN_KEYS)[number];

export type PlanIntent = { plan: PaidTalentPlanKey; interval: "month" | "year" };

export function parsePlanIntent(plan: unknown, interval: unknown): PlanIntent | null {
  if (typeof plan !== "string" || !(PAID_TALENT_PLAN_KEYS as readonly string[]).includes(plan)) return null;
  return { plan: plan as PaidTalentPlanKey, interval: interval === "year" ? "year" : "month" };
}

/** Query string (no leading `?`) for the intent, empty when none. */
export function planIntentQuery(intent: PlanIntent | null): string {
  if (!intent) return "";
  return new URLSearchParams({ plan: intent.plan, interval: intent.interval }).toString();
}

/**
 * Where "Finish upgrading" goes: the slug-less app route `/talent/plan`, which
 * resolves the person's workspace and starts checkout. Derived from the
 * arrival's `/talent/today` link so it stays on the same app host. Null when
 * there is no intent or no usable link.
 */
export function upgradeHrefFromToday(todayHref: string | null | undefined, intent: PlanIntent | null): string | null {
  if (!intent || !todayHref) return null;
  if (!/\/talent\/today\/?$/.test(todayHref)) return null;
  return `${todayHref.replace(/\/talent\/today\/?$/, "/talent/plan")}?${planIntentQuery(intent)}`;
}

/** Reads the intent from the current URL, for a client component. */
export function readPlanIntentFromUrl(): PlanIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const sp = new URL(window.location.href).searchParams;
    return parsePlanIntent(sp.get("plan"), sp.get("interval"));
  } catch {
    return null;
  }
}
