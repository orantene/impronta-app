"use server";

/**
 * Onboarding 1B step 3 ("Set up the essentials"): load the prefill and save
 * the confirmed essentials on the brief's `module_state.essentials`. The build
 * (1C) writes them for real once the account exists; nothing here touches the
 * catalogue. Same gate and owner resolution as the rest of the module.
 */

import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";
import { loadBrief } from "@/lib/tulala/brief-store.server";
import { listFact, stringFact } from "@/lib/tulala/brief-store";
import { updateBriefModuleState } from "@/lib/tulala/brief-module-state.server";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";
import { choiceToPath, localePatch, parsePersistedModuleState } from "@/lib/onboarding/module-state";
import { choiceToIntent } from "@/lib/onboarding/module-state";
import {
  parseEssentials,
  servicesFromFacts,
  suggestedEssentials,
  type Essentials,
} from "@/lib/onboarding/essentials";
import type { OnboardingChoice } from "@/lib/onboarding/choice";

export type SetupPayload = {
  choice: OnboardingChoice;
  country: string | null;
  /** What the screen opens with: the saved record, else AI-read services over a trade pack. */
  essentials: Essentials;
  /** True when the person already confirmed once (resume). */
  saved: boolean;
};

export type SetupLoadResult = { ok: true; setup: SetupPayload } | { ok: false; code: "module_off" | "no_owner" | "no_brief" };
export type SetupSaveResult = { ok: true; talentOnly: boolean } | { ok: false; code: "module_off" | "no_owner" | "no_brief" | "invalid" | "save_failed" };

async function owned() {
  if (!(await getOnboardingFlags()).onboarding_module_enabled) return { error: "module_off" as const };
  const resolved = await resolveBriefOwner();
  if (!resolved) return { error: "no_owner" as const };
  const brief = await loadBrief(resolved.owner);
  if (!brief) return { error: "no_brief" as const };
  return { brief, state: parsePersistedModuleState(brief.moduleState) };
}

export async function loadOnboardingSetup(): Promise<SetupLoadResult> {
  const got = await owned();
  if ("error" in got && got.error) return { ok: false, code: got.error };
  const { brief, state } = got as Exclude<typeof got, { error: string }>;
  const choice = state.choice ?? (state.path === "business" ? "studio" : state.path === "both" ? "both" : "myself");
  const country = stringFact(brief, "person.country");
  const locale = state.locale ?? "en";
  const name = stringFact(brief, "business.name") ?? stringFact(brief, "person.professional_name") ?? stringFact(brief, "person.name");
  const ctx = {
    trade: state.typeChoice?.slug ?? null,
    discipline: stringFact(brief, "work.discipline") ?? stringFact(brief, "work.industry"),
    country,
    locale,
  } as const;
  const saved = state.essentials ?? null;
  let essentials: Essentials;
  if (saved && saved.services.length) essentials = saved;
  else {
    const base = suggestedEssentials({ ...ctx, name });
    const fromWords = servicesFromFacts(listFact(brief, "work.services"), ctx);
    // What the person said wins over a trade pack; the pack fills in when they said nothing.
    essentials = fromWords.length ? { ...base, services: fromWords, source: "ai" } : base;
    if (saved) essentials = { ...essentials, hours: saved.hours ?? essentials.hours, place: saved.place, timezone: saved.timezone ?? essentials.timezone };
  }
  return { ok: true, setup: { choice, country, essentials, saved: !!saved?.confirmed } };
}

export async function saveOnboardingSetup(input: { essentials: unknown; locale?: "en" | "es" }): Promise<SetupSaveResult> {
  const got = await owned();
  if ("error" in got && got.error) return { ok: false, code: got.error };
  const { brief, state } = got as Exclude<typeof got, { error: string }>;
  const parsed = parseEssentials(input.essentials);
  if (!parsed || parsed.services.length === 0) return { ok: false, code: "invalid" };
  const essentials: Essentials = { ...parsed, confirmed: true };
  const choice = state.choice;
  const talentOnly = choice ? choiceToIntent(choice) === "talent" : (state.path ?? "talent") === "talent";
  const saved = await updateBriefModuleState(brief.id, {
    essentials,
    ...(choice ? { path: choiceToPath(choice) } : {}),
    step: talentOnly ? "readyToBuild" : "style",
    ...localePatch(input.locale),
    updatedAt: new Date().toISOString(),
  });
  if (!saved.ok) return { ok: false, code: "save_failed" };
  return { ok: true, talentOnly };
}
