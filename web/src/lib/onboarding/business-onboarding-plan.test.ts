import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { ArrivalPayload } from "./arrival";
import { BUSINESS_ONBOARDING_STEPS } from "./business-onboarding-template";
import { factsFromArrival, instantiateBusinessOnboarding } from "./business-onboarding-plan";

const root = path.resolve(__dirname, "../../..");
const catalog = (l: string) => JSON.parse(fs.readFileSync(path.join(root, "messages", `${l}.json`), "utf8"));
const tFor = (l: string) => {
  const c = catalog(l);
  return (key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], c) as string;
};
const ALL_IDS = BUSINESS_ONBOARDING_STEPS.map((s) => s.id);

test("template selection: salons, agencies, studios and restaurants all get every section", () => {
  // Trades the talent table has never heard of must not lose (or gain) sections.
  for (const trade of ["salon", "agency", "studio", "restaurant", "barber", "tutor", null, "zzz-unknown"]) {
    const plan = instantiateBusinessOnboarding({ businessName: "X", locale: "en", trade }, tFor("en"));
    assert.deepEqual(plan.steps.map((s) => s.id), ALL_IDS, String(trade));
    assert.equal(plan.template, "nw5");
  }
});

test("template selection: a business that cannot add people can still drop the team row", () => {
  const plan = instantiateBusinessOnboarding({ businessName: "X", locale: "en", trade: "tutor", teamCapable: false }, tFor("en"));
  assert.ok(!plan.steps.some((s) => s.id === "team"));
});

test("name substitution: the business name lands in the copy, in en and es, with no raw placeholder left", () => {
  for (const locale of ["en", "es"]) {
    const plan = instantiateBusinessOnboarding({ businessName: "  Luna Studio ", locale }, tFor(locale));
    assert.equal(plan.businessName, "Luna Studio");
    assert.equal(plan.locale, locale);
    const text = [plan.heading, ...plan.steps.flatMap((s) => [s.title, s.description])].join("\n");
    assert.ok(text.includes("Luna Studio"), locale);
    assert.ok(!text.includes("{business}"), `${locale} placeholder left`);
    assert.ok(!/[–—]/.test(text), `${locale} dash`);
  }
});

test("name substitution: missing name falls back to a localized generic, never blank or a placeholder", () => {
  const en = instantiateBusinessOnboarding({ businessName: "   ", locale: "en" }, tFor("en"));
  const es = instantiateBusinessOnboarding({ businessName: null, locale: "es" }, tFor("es"));
  assert.equal(en.businessName, "your business");
  assert.equal(es.businessName, "tu negocio");
  assert.ok(en.heading.includes("your business") && es.heading.includes("tu negocio"));
});

test("locale: titles come from the requested language", () => {
  const en = instantiateBusinessOnboarding({ businessName: "Luna", locale: "en" }, tFor("en"));
  const es = instantiateBusinessOnboarding({ businessName: "Luna", locale: "es" }, tFor("es"));
  assert.notDeepEqual(en.steps.map((s) => s.title), es.steps.map((s) => s.title));
  assert.equal(en.steps.length, es.steps.length);
});

test("section presence: every step has non-empty title and description in both locales", () => {
  for (const locale of ["en", "es"]) {
    const plan = instantiateBusinessOnboarding({ businessName: "Luna", locale }, tFor(locale));
    for (const s of plan.steps) {
      assert.ok(s.title.trim() && s.description.trim(), `${locale} ${s.id}`);
      assert.ok(!s.title.startsWith("businessOnboarding."), `${locale} ${s.id} missing key`);
    }
    assert.ok(!plan.heading.startsWith("businessOnboarding."));
  }
});

const arrival = (over: Partial<ArrivalPayload> & { fact?: Partial<ArrivalPayload["fact"]> } = {}): ArrivalPayload => ({
  variant: "business",
  headlineName: null,
  businessName: "Luna",
  link: { display: "luna.example", href: "https://luna.example" },
  primary: { label: "open_my_website", href: "https://luna.example" },
  quiet: null,
  ...over,
  fact: { services: 0, city: null, logo: false, hours: false, whatsapp: false, menuItems: 0, photos: false, ...over.fact },
});

test("facts come only from what the arrival proves", () => {
  const bare = factsFromArrival(arrival());
  assert.deepEqual(bare, { essentials: false, website: true });
  const rich = factsFromArrival(arrival({ fact: { services: 3, city: "Cancun", hours: true, photos: true } }));
  assert.deepEqual(
    { s: rich.services, a: rich.availability, l: rich.location, p: rich.photo, e: rich.essentials },
    { s: true, a: true, l: true, p: true, e: true },
  );
  const fallback = factsFromArrival(arrival({ variant: "fallback" }));
  assert.equal(fallback.website, undefined);
});

test("progress counts done sections from arrival facts", () => {
  const plan = instantiateBusinessOnboarding(
    { businessName: "Luna", locale: "en", facts: factsFromArrival(arrival({ fact: { services: 2, hours: true } })) },
    tFor("en"),
  );
  assert.deepEqual(plan.steps.filter((s) => s.done).map((s) => s.id), ["basics", "services", "hours", "publish"]);
  assert.deepEqual(plan.progress, { done: 4, total: ALL_IDS.length });
});

test("wiring: the arrival step renders the template for business arrivals and gets the flow locale", () => {
  const step = fs.readFileSync(path.join(root, "src/components/onboarding/steps/arrival-step.tsx"), "utf8");
  assert.match(step, /instantiateBusinessOnboarding\(\{ businessName: arrival\.businessName, locale, facts: factsFromArrival\(arrival\) \}, t\)/);
  assert.match(step, /business \? instantiateBusinessOnboarding/);
  assert.match(step, /data-testid="onb-business-setup"/);
  const mod = fs.readFileSync(path.join(root, "src/components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(mod, /<ArrivalStep\s+t=\{t\}\s+locale=\{locale\}/);
});
