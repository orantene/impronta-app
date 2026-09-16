/**
 * The module's follow-up questions: stable ids, the facts each one fills, and
 * the rule that decides whether it is asked. Kept apart from the chat intake's
 * `lib/tulala/questions.ts` (stage-driven, telemetry-bound); the module asks
 * only what the understood card shows as missing, chips first, typing last.
 */

import { isKnownFactKey } from "@/lib/tulala/fact-keys";

import type { OnboardingPath } from "./module-state";

export type ModuleQuestionId =
  | "fork"
  | "basics"
  | "kind_of_business"
  | "name"
  | "services"
  | "two_quick_things"
  | "link_confirm"
  | "link_name";

type LineLike = { id: string; status: "known" | "assumed" | "missing" | "later" };

export type ModuleQuestion = {
  id: ModuleQuestionId;
  /** Facts this question can write. Every key must be in the vocabulary. */
  targets: readonly string[];
  control: "cards" | "chips" | "text" | "text2" | "services" | "hours+whatsapp" | "yesno";
  /** Whether to ask, given the understood card. */
  askWhen: (ctx: { lines: readonly LineLike[]; path: OnboardingPath }) => boolean;
};

const missing = (lines: readonly LineLike[], id: string) =>
  lines.some((l) => l.id === id && l.status === "missing");

export const MODULE_QUESTIONS: readonly ModuleQuestion[] = [
  { id: "fork", targets: [], control: "cards", askWhen: () => false },
  {
    // The short form: what you do and where. Normally read from the words;
    // asked only when the AI could not read them (flags off, no model).
    id: "basics",
    targets: ["work.discipline", "work.industry", "person.city"],
    control: "text2",
    askWhen: ({ lines }) => missing(lines, "what") || missing(lines, "city"),
  },
  {
    id: "kind_of_business",
    targets: ["work.industry"],
    control: "chips",
    askWhen: ({ lines, path }) => path !== "talent" && missing(lines, "kind"),
  },
  {
    id: "name",
    targets: ["person.professional_name", "person.name"],
    control: "text",
    askWhen: ({ lines }) => missing(lines, "name"),
  },
  {
    id: "services",
    targets: ["work.services"],
    control: "services",
    askWhen: ({ lines }) => missing(lines, "services") || missing(lines, "offer"),
  },
  {
    id: "two_quick_things",
    targets: ["business.hours", "presence.whatsapp"],
    control: "hours+whatsapp",
    askWhen: ({ lines, path }) => path !== "talent" && (missing(lines, "hours") || missing(lines, "whatsapp")),
  },
  { id: "link_confirm", targets: ["business.name"], control: "yesno", askWhen: () => false },
  { id: "link_name", targets: [], control: "text", askWhen: () => false },
];

export function moduleQuestionById(id: ModuleQuestionId): ModuleQuestion {
  const q = MODULE_QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`unknown module question ${id}`);
  return q;
}

/** Guard: every target is a real fact key (a typo here would write nowhere). */
export function unknownQuestionTargets(): string[] {
  return MODULE_QUESTIONS.flatMap((q) => q.targets.filter((k) => !isKnownFactKey(k)));
}

/** Hours presets → `business.hours` lines, in the person's language. */
export const HOURS_PRESETS = {
  weekdays_9_6: { en: ["Mon-Fri 09:00-18:00"], es: ["Lun-Vie 09:00-18:00"] },
  mon_sat_9_7: { en: ["Mon-Sat 09:00-19:00"], es: ["Lun-Sab 09:00-19:00"] },
  every_day: { en: ["Every day 10:00-20:00"], es: ["Todos los dias 10:00-20:00"] },
  evenings: { en: ["Tue-Sun 18:00-23:00"], es: ["Mar-Dom 18:00-23:00"] },
  by_appointment: { en: ["By appointment"], es: ["Con cita"] },
} as const;

export type HoursPresetId = keyof typeof HOURS_PRESETS;

export function hoursFromPreset(id: HoursPresetId, locale: "en" | "es"): string[] {
  return [...HOURS_PRESETS[id][locale]];
}

/** E.164 with country code, 8–15 digits after the plus. */
export const WHATSAPP_RE = /^\+\d{8,15}$/;

/** Accepts `+<cc><number>` or `00<cc><number>`; a bare local number is refused (no guessing the country). */
export function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, "");
  const withPlus = digits.startsWith("+") ? digits : digits.startsWith("00") ? `+${digits.slice(2)}` : null;
  return withPlus && WHATSAPP_RE.test(withPlus) ? withPlus : null;
}
