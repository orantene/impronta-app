/**
 * One front door (owner ruling 2026-09-17): while the onboarding module is
 * on, every older way in (`/get-started`, `/get-started/agent`, the tier
 * links, the talent modal) lands in the module. The old pages keep working
 * only when the flag is off.
 *
 * Pure: maps the old URL's params onto the module's intent and the home URL
 * that opens it. `?start=` is read by the module host on the marketing home.
 */

import type { OnboardingIntent } from "./module-state";

export const START_PARAM = "start";

/** Old `/get-started` params → what the person meant. */
export function intentFromLegacyParams(params: { tier?: string | null; audience?: string | null; intent?: string | null }): OnboardingIntent {
  const intent = (params.intent ?? "").toLowerCase();
  if (intent === "talent" || intent === "business") return intent;
  const audience = (params.audience ?? "").toLowerCase();
  if (audience === "talent") return "talent";
  const tier = (params.tier ?? "").toLowerCase();
  if (tier === "talent" || tier === "talent_pro" || tier === "talent_portfolio") return "talent";
  if (tier) return "business";
  return "unknown";
}

/** The marketing home with the module opening on load; `promo` survives the hop. */
export function frontDoorUrl(intent: OnboardingIntent, extra: { promo?: string | null; locale?: string | null } = {}): string {
  const q = new URLSearchParams();
  q.set(START_PARAM, intent);
  if (extra.promo && /^[A-Za-z0-9_-]{1,40}$/.test(extra.promo)) q.set("promo", extra.promo);
  const base = extra.locale === "es" ? "/es" : "/";
  return `${base}?${q.toString()}`;
}

/** `?start=` value → intent, or null when the URL does not ask for the module. */
export function intentFromStartParam(value: string | null | undefined): OnboardingIntent | null {
  if (value == null) return null;
  const v = value.toLowerCase();
  if (v === "talent" || v === "business") return v;
  if (v === "1" || v === "true" || v === "unknown" || v === "") return "unknown";
  return null;
}
