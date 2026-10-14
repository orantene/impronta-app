/**
 * plan-intent.ts: the paid plan a visitor picked on /pricing, carried through
 * the /start front door (TUL-828). Pure, so it is unit tested.
 *
 * `/start?plan=<PlanKey>&interval=<month|year>` is untrusted. Only the paid
 * talent plans and the self-serve workspace plans survive; anything else
 * (free, network which is sales-assisted, junk) is ignored and the normal flow
 * runs. Checkout re-validates everything server-side
 * (`startTalentUpgrade`), this only decides whether to offer the upgrade.
 */

export const PAID_TALENT_PLAN_KEYS = ["talent_pro", "talent_portfolio"] as const;
export type PaidTalentPlanKey = (typeof PAID_TALENT_PLAN_KEYS)[number];

/** Self-serve workspace (agency) plans; network is sales-assisted (no catalog price). */
export const PAID_WORKSPACE_PLAN_KEYS = ["website", "studio", "agency"] as const;
export type PaidWorkspacePlanKey = (typeof PAID_WORKSPACE_PLAN_KEYS)[number];

export type PlanIntent = { plan: PaidTalentPlanKey | PaidWorkspacePlanKey; interval: "month" | "year" };

export function isTalentIntent(intent: PlanIntent | null): intent is { plan: PaidTalentPlanKey; interval: "month" | "year" } {
  return !!intent && (PAID_TALENT_PLAN_KEYS as readonly string[]).includes(intent.plan);
}

export function isWorkspaceIntent(intent: PlanIntent | null): intent is { plan: PaidWorkspacePlanKey; interval: "month" | "year" } {
  return !!intent && (PAID_WORKSPACE_PLAN_KEYS as readonly string[]).includes(intent.plan);
}

export function parsePlanIntent(plan: unknown, interval: unknown): PlanIntent | null {
  if (typeof plan !== "string") return null;
  const ok = (PAID_TALENT_PLAN_KEYS as readonly string[]).includes(plan) || (PAID_WORKSPACE_PLAN_KEYS as readonly string[]).includes(plan);
  if (!ok) return null;
  return { plan: plan as PlanIntent["plan"], interval: interval === "year" ? "year" : "month" };
}

/** Display name for "Finish upgrading to {plan}". */
export function planIntentLabel(intent: PlanIntent): string {
  switch (intent.plan) {
    case "talent_portfolio": return "Portfolio";
    case "talent_pro": return "Pro";
    case "website": return "Website";
    case "studio": return "Studio";
    case "agency": return "Agency";
  }
}

/**
 * Where "Finish upgrading" goes for a workspace plan: the workspace billing
 * page, which auto-starts checkout. `adminHref` is the arrival's admin URL
 * (`.../<slug>/admin`). Null for a talent intent, no intent or no link.
 */
export function workspaceUpgradeHref(adminHref: string | null | undefined, intent: PlanIntent | null): string | null {
  if (!isWorkspaceIntent(intent) || !adminHref) return null;
  return `${adminHref.replace(/\/+$/, "")}/account?${planIntentQuery(intent)}`;
}

export type WorkspaceAutoStart = "start" | "skip";

/**
 * Whether the billing page should auto-start checkout. Only a purchasable
 * workspace plan, for someone who can manage billing, on a workspace with no
 * live subscription (subscribers use the normal page: Manage / plan change).
 */
export function workspaceAutoStartDecision(input: {
  plan: unknown;
  interval: unknown;
  canManageBilling: boolean;
  hasActiveSubscription: boolean;
  stripeEnabled: boolean;
}): { action: WorkspaceAutoStart; intent: (PlanIntent & { plan: PaidWorkspacePlanKey }) | null } {
  const intent = parsePlanIntent(input.plan, input.interval);
  if (!isWorkspaceIntent(intent)) return { action: "skip", intent: null };
  if (!input.canManageBilling || !input.stripeEnabled || input.hasActiveSubscription) return { action: "skip", intent: null };
  return { action: "start", intent };
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
  if (!isTalentIntent(intent) || !todayHref) return null;
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
