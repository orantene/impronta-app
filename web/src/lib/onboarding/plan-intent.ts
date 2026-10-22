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

import { planDisplayNameFor } from "@/lib/access/plan-catalog";
import { TALENT_PAID_TIER_LABEL, TALENT_PAID_TIER_LABEL_ES } from "@/lib/access/talent-tier-label";

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

/**
 * Tolerant interval read (BILL-B): `year` or `y` is yearly, anything else
 * (`month`, `m`, missing, junk) is monthly. `m|y` is what the in-app upgrade
 * modal sent before it pointed at /talent/plan, so old links keep the yearly
 * choice.
 */
export function parsePlanIntentInterval(interval: unknown): "month" | "year" {
  const v = typeof interval === "string" ? interval.trim().toLowerCase() : "";
  return v === "year" || v === "y" ? "year" : "month";
}

export function parsePlanIntent(plan: unknown, interval: unknown): PlanIntent | null {
  if (typeof plan !== "string") return null;
  const ok = (PAID_TALENT_PLAN_KEYS as readonly string[]).includes(plan) || (PAID_WORKSPACE_PLAN_KEYS as readonly string[]).includes(plan);
  if (!ok) return null;
  return { plan: plan as PlanIntent["plan"], interval: parsePlanIntentInterval(interval) };
}

/**
 * Display name for "Finish upgrading to {plan}". The one paid talent plan uses
 * the catalog tier label (Web Office / Oficina Web, lib/access/talent-tier-label),
 * the same name the upgrade modal and the billing panel show; "Portfolio" had no
 * Spanish name.
 */
export function planIntentLabel(intent: PlanIntent, locale?: string | null): string {
  switch (intent.plan) {
    case "talent_portfolio": return (locale ?? "").toLowerCase().startsWith("es") ? TALENT_PAID_TIER_LABEL_ES : TALENT_PAID_TIER_LABEL;
    case "talent_pro": return "Pro";
    case "website": return "Website";
    case "studio": return "Studio";
    case "agency": return "Agency";
  }
}

/**
 * TUL-1897: the ONE localized name of a talent plan key, for every plan-change surface (preview, confirm sheet,
 * pending banner). Paid talent plans read the same fixed names as the upgrade modal ("Oficina Web"); the catalog's
 * own display name is NOT used for them because the dark-build overlay still reads "Portfolio" ("Portafolio" in es).
 * Free reads the catalog. Unknown keys read "" (the sentence then drops the name rather than inventing one).
 */
export function talentPlanDisplayName(plan: string, locale?: string | null): string {
  if (plan === "talent_portfolio" || plan === "talent_pro") return planIntentLabel({ plan, interval: "month" }, locale);
  if (plan === "talent_basic") return planDisplayNameFor("talent_basic", locale);
  return "";
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

export type PlanIntentAction = "checkout" | "plan_change" | "none";

/**
 * TUL-831 · what a plan intent does for someone who may already subscribe.
 * No live subscription -> hosted checkout; a live subscription -> the in-app
 * plan change confirm (never a second checkout); the plan and interval the
 * subscriber is already on -> nothing. `currentInterval` null means unknown,
 * so a same-plan intent still opens the confirm and the server preview
 * answers "already on this plan".
 */
export function planIntentAction(input: {
  hasSubscription: boolean;
  currentPlan: string | null;
  currentInterval: "month" | "year" | null;
  intent: PlanIntent | null;
}): PlanIntentAction {
  if (!input.intent) return "none";
  if (!input.hasSubscription) return "checkout";
  if (input.currentPlan === input.intent.plan && input.currentInterval === input.intent.interval) return "none";
  return "plan_change";
}

/** `from` (which paywall or link started the upgrade) when it is a plain slug; anything else is dropped. */
export function sanitizePlanIntentFrom(from: unknown): string | null {
  return typeof from === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(from) ? from : null;
}

/** Query string (no leading `?`) for the intent, empty when none. `from` survives redirects (BILL-B). */
export function planIntentQuery(intent: PlanIntent | null, from?: unknown): string {
  if (!intent) return "";
  const q = new URLSearchParams({ plan: intent.plan, interval: intent.interval });
  const f = sanitizePlanIntentFrom(from);
  if (f) q.set("from", f);
  return q.toString();
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
