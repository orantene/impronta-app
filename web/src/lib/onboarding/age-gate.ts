/**
 * 18+ gate (owner decision 2026-10-01): a public talent page does not go live
 * until the person confirmed they are 18 or older.
 *
 * Pure. Applies to every choice that creates a public talent profile
 * (myself, both); a studio makes no talent profile, so it needs nothing.
 *
 * Where it is stored: `module_state.age18ConfirmedAt` (+ `age18ConfirmedBy`)
 * on the onboarding brief. `terms_acceptances.context` is a closed CHECK list,
 * so a new kind would need a migration; this slice adds none.
 *
 * After #2743 lands, in `runChoiceProvisioning`, right before the
 * `promoteTalentProfileLive` call, add one line:
 *   const gate = requireAge18ForPublish({ choice, confirmedAt: deps.age18ConfirmedAt, locale: deps.locale });
 * and return `{ ok: false, code: gate.code, message: gate.message, choice }`
 * when `!gate.ok` (the build route already refuses earlier, so this is
 * defence in depth).
 */

import type { OnboardingChoice } from "./choice";

export const AGE_18_REQUIRED_CODE = "age_18_required" as const;

export type Age18Gate =
  | { ok: true; required: boolean }
  | { ok: false; code: typeof AGE_18_REQUIRED_CODE; message: string; backStep: "readyToBuild"; profile: "draft" };

const MESSAGES = {
  en: "Your page is not live yet. Confirm you are 18 or older to put it online.",
  es: "Tu página todavía no está en línea. Confirma que tienes 18 años o más para publicarla.",
} as const;

/** True for the choices that create a public talent profile. */
export function choiceNeedsAge18(choice: OnboardingChoice | null | undefined): boolean {
  return choice === "myself" || choice === "both";
}

/** A confirmation counts only when it is a parseable timestamp. */
export function hasAge18Confirmation(confirmedAt: unknown): boolean {
  return typeof confirmedAt === "string" && Number.isFinite(Date.parse(confirmedAt));
}

export function requireAge18ForPublish(input: {
  choice: OnboardingChoice | null | undefined;
  confirmedAt: unknown;
  locale?: "en" | "es";
}): Age18Gate {
  if (!choiceNeedsAge18(input.choice)) return { ok: true, required: false };
  if (hasAge18Confirmation(input.confirmedAt)) return { ok: true, required: true };
  return {
    ok: false,
    code: AGE_18_REQUIRED_CODE,
    message: MESSAGES[input.locale === "es" ? "es" : "en"],
    backStep: "readyToBuild",
    profile: "draft",
  };
}
