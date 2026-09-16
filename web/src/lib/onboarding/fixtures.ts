/**
 * The three people every onboarding screen is designed around (screen-spec
 * v3.3): Rosa (home cleaner, talent only), Mariana (nail artist with a salon,
 * both), Parrilla El Paisa (restaurant from a pasted link, business).
 *
 * Each carries the sentence in both languages, the facts the extraction is
 * expected to read (with the provenance a model or an import would give them),
 * and what the understood card must say. Pure data: unit tests, the fixture
 * model adapter and the Playwright specs all read from here so one change
 * moves every layer.
 */

import type { Brief, BriefFact, FactSource, FactStatus } from "@/lib/tulala/brief-store";

import type { OnboardingIntent, OnboardingPath } from "./module-state";
import type { ModuleQuestionId } from "./module-questions";

export type FixtureFactRow = readonly [
  factKey: string,
  value: string | number | boolean | string[] | Array<{ title: string; price?: number }>,
  source?: FactSource,
  status?: FactStatus,
];

export type OnboardingFixture = {
  id: "rosa" | "mariana" | "el-paisa";
  sentence: { en: string; es: string };
  /** For El Paisa: the link that is pasted instead of a sentence. */
  link?: string;
  intent: OnboardingIntent;
  facts: readonly FixtureFactRow[];
  expect: {
    path: OnboardingPath;
    pathConfidence: "clear" | "ambiguous";
    followUps: readonly ModuleQuestionId[];
    known: readonly string[];
    assumed: readonly string[];
    missing: readonly string[];
    linkSlug: string | null;
  };
};

export const ONBOARDING_FIXTURES: readonly OnboardingFixture[] = [
  {
    id: "rosa",
    sentence: {
      en: "I clean houses in Playa del Carmen, Monday to Saturday, and I can do deep cleaning too.",
      es: "Limpio casas en Playa del Carmen, de lunes a sábado, y también hago limpieza profunda.",
    },
    intent: "talent",
    facts: [
      ["work.discipline", "House cleaner", "ai_inference", "needs_approval"],
      ["work.industry", "Home cleaning", "ai_inference", "needs_approval"],
      ["person.city", "Playa del Carmen", "ai_inference", "needs_approval"],
      ["person.country", "MX", "ai_inference", "suggested"],
      ["work.services", ["House cleaning", "Deep cleaning"], "ai_inference", "needs_approval"],
      ["business.works_alone", true, "ai_inference", "needs_approval"],
      ["business.hours", ["Mon-Sat"], "ai_inference", "suggested"],
    ],
    expect: {
      path: "talent",
      pathConfidence: "clear",
      followUps: ["name"],
      known: [],
      assumed: ["what", "city", "services"],
      missing: ["name"],
      linkSlug: null,
    },
  },
  {
    id: "mariana",
    sentence: {
      en: "I have a nail salon in Tulum called Uñas Mariana, I do gel and acrylics, and I also go to clients' homes.",
      es: "Tengo un salón de uñas en Tulum que se llama Uñas Mariana, hago gel y acrílicas, y también voy a domicilio.",
    },
    intent: "unknown",
    facts: [
      ["person.name", "Mariana", "ai_inference", "needs_approval"],
      ["work.discipline", "Nail artist", "ai_inference", "needs_approval"],
      ["work.industry", "Nail salon", "ai_inference", "needs_approval"],
      ["business.exists", true, "ai_inference", "needs_approval"],
      ["business.name", "Uñas Mariana", "ai_inference", "needs_approval"],
      ["person.city", "Tulum", "ai_inference", "needs_approval"],
      ["work.services", ["Gel nails", "Acrylic nails", "Home visits"], "ai_inference", "needs_approval"],
      ["work.performs_service_personally", true, "ai_inference", "needs_approval"],
    ],
    expect: {
      path: "both",
      pathConfidence: "clear",
      followUps: ["two_quick_things"],
      known: [],
      assumed: ["businessName", "kind", "offer", "city", "name", "what"],
      missing: ["hours", "whatsapp"],
      linkSlug: "unas-mariana",
    },
  },
  {
    id: "el-paisa",
    sentence: { en: "parrillaelpaisa.com", es: "parrillaelpaisa.com" },
    link: "https://parrillaelpaisa.com",
    intent: "business",
    facts: [
      ["business.name", "Parrilla El Paisa", "url_import", "needs_approval"],
      ["business.exists", true, "url_import", "needs_approval"],
      ["work.industry", "Argentine grill restaurant", "url_import", "needs_approval"],
      ["person.city", "Cancún", "url_import", "needs_approval"],
      ["business.hours", ["Tue-Sun 13:00-23:00"], "url_import", "needs_approval"],
      ["presence.whatsapp", "+529981234567", "url_import", "needs_approval"],
      ["presence.website_url", "https://parrillaelpaisa.com", "url_import", "confirmed"],
      ["business.has_staff", true, "url_import", "needs_approval"],
      ["menu.categories", ["Parrilla", "Empanadas", "Postres"], "url_import", "needs_approval"],
      ["menu.items", [{ title: "Bife de chorizo", price: 420 }, { title: "Empanadas de carne", price: 90 }], "url_import", "needs_approval"],
      ["work.services", ["Parrilla", "Empanadas", "Postres"], "url_import", "needs_approval"],
      ["brand.logo_url", "https://parrillaelpaisa.com/logo.png", "url_import", "needs_approval"],
    ],
    expect: {
      path: "business",
      pathConfidence: "clear",
      followUps: [],
      known: [],
      assumed: ["businessName", "kind", "offer", "city", "hours", "whatsapp"],
      missing: [],
      linkSlug: "parrilla-el-paisa",
    },
  },
];

export function fixtureById(id: OnboardingFixture["id"]): OnboardingFixture {
  const f = ONBOARDING_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown fixture ${id}`);
  return f;
}

/** A Brief with the fixture's facts, provenance included. */
export function briefFromOnboardingFixture(fixture: OnboardingFixture, overrides: Partial<Brief> = {}): Brief {
  const facts: BriefFact[] = fixture.facts.map(([factKey, value, source = "user_stated", status]) => ({
    factKey,
    value,
    source,
    status: status ?? (source === "user_stated" ? "confirmed" : "needs_approval"),
    confidence: source === "user_stated" ? 1 : 0.7,
    sourceExcerpt: null,
    sourceUrl: fixture.link ?? null,
    questionId: null,
    questionVersion: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  return {
    id: `fixture-${fixture.id}`,
    facts,
    status: "discovering",
    locale: "en",
    currentVersion: 1,
    engineVersion: null,
    profileId: null,
    guestSessionId: null,
    signupLeadId: null,
    talentProfileId: null,
    tenantId: null,
    moduleState: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
