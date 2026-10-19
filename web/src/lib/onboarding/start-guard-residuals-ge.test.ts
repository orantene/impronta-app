// Residuals found by QA AFTER the first fixes merged (TUL-808, 810, 815, 818, 819, 841, 842, 846).
// Each test pins the behaviour the QA note said was still missing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ArrivalStep } from "@/components/onboarding/steps/arrival-step";
import { ReadyStep } from "@/components/onboarding/steps/ready-step";
import { CatalogWhoContact } from "@/components/public-booking/catalog-who-contact";
import { resolveVerifiedLiveBadge } from "@/components/talent/website-reward/useVerifiedLiveBadge";
import { arrivalFromStamp, applyRetryCheck, draftSawKey, draftSupportLine } from "@/lib/onboarding/arrival";
import { planOfferingWrites, type Essentials, type WeeklyEssentialHours } from "@/lib/onboarding/essentials";
import { reviewSetupLines } from "@/lib/onboarding/review-setup-lines";
import { defaultWhere, whereChoicesForPlace, whereForPlace } from "@/lib/onboarding/service-where";
import { timezoneDisplayName } from "@/lib/onboarding/setup";
import { dropOtherTradeStock } from "@/lib/onboarding/stock-hero";
import { ONBOARDING_FIXTURES, briefFromOnboardingFixture } from "@/lib/onboarding/fixtures";
import { buildUnderstanding, type Understanding } from "@/lib/onboarding/understanding";

type Msgs = Record<string, unknown>;
const lookup = (l: string) => {
  const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")) as Msgs;
  return (key: string): string => {
    const v = key.split(".").reduce<unknown>((o, k) => (o as Msgs | undefined)?.[k], m);
    return typeof v === "string" ? v : key;
  };
};
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── TUL-808 / TUL-841: where a service happens follows the place ─────────────

test("TUL-808: a person who goes to the client is never offered 'At my studio' in the editor", () => {
  assert.deepEqual(whereChoicesForPlace("client"), ["client", "remote", "agreed"]);
  assert.deepEqual(whereChoicesForPlace("studio"), ["studio", "client", "remote", "agreed"]);
  assert.deepEqual(whereChoicesForPlace(null), ["studio", "client", "remote", "agreed"]);
  // An item that already carries studio keeps it visible so it can be removed.
  assert.ok(whereChoicesForPlace("client", ["studio"]).includes("studio"));
});

test("TUL-808: with no saved default, the place decides the starting 'where'", () => {
  assert.deepEqual(defaultWhere(null, "client"), ["client"]);
  assert.deepEqual(defaultWhere([], "client"), ["client"]);
  assert.deepEqual(defaultWhere(null, "home"), ["studio"]);
  assert.deepEqual(defaultWhere(null, null), ["studio"]);
  assert.deepEqual(defaultWhere(["client", "remote"], "studio"), ["client", "remote"]);
  assert.deepEqual(whereForPlace("client"), ["client"]);
});

test("TUL-808: the editor and defaults screens use the place-aware choices", () => {
  assert.match(src("src/components/talent/services/EditorScreen.tsx"), /whereChoicesForPlace\(defaults\?\.placeMode, where\)/);
  assert.match(src("src/components/talent/services/EditorScreen.tsx"), /whereChoices\.map\(/);
  assert.match(src("src/components/talent/services/DefaultsScreen.tsx"), /whereChoicesForPlace\(defaults\.placeMode/);
  assert.match(src("src/lib/talent/services-settings-actions.ts"), /defaultWhere\(null, placeMode\)/);
});

const svc = [{ name: "Limpieza de casa", durationMin: 120, priceCents: 90000, quote: false, currency: "MXN" }];

test("TUL-841: services onboarding writes carry 'where' from the chosen place, so the booking sheet asks for the address", () => {
  const client = planOfferingWrites([], svc, { mode: "client", area: "Playa del Carmen" });
  assert.deepEqual(client.insert[0].attributes, { where: ["client"] });
  const studio = planOfferingWrites([], svc, { mode: "studio", area: null });
  assert.deepEqual(studio.insert[0].attributes, { where: ["studio"] });
  assert.equal(planOfferingWrites([], svc).insert[0].attributes, undefined);
});

test("TUL-841: an upgraded draft gets the same 'where'", () => {
  const plan = planOfferingWrites([{ id: "d1", title: "Limpieza de casa", status: "draft" }], svc, { mode: "client", area: null });
  assert.deepEqual(plan.update[0].patch.attributes, { where: ["client"] });
});

test("TUL-841: the editor saves the shown 'where' when the item has none of its own", () => {
  assert.match(src("src/components/talent/services/EditorScreen.tsx"), /item\.attributes\?\.where === undefined/);
});

// ── TUL-810: the review step shows the business name ────────────────────────

test("TUL-810: a solo pro's business name reaches the understood lines and the review step", () => {
  const fx = ONBOARDING_FIXTURES.find((f) => f.expect.path === "talent")!;
  const brief = briefFromOnboardingFixture(fx);
  brief.facts.push({ factKey: "business.name", value: "Ana Cleaning Co", source: "user_stated", status: "confirmed", confidence: 1, sourceExcerpt: null, sourceUrl: null, questionId: null, questionVersion: null, updatedAt: "" });
  const u = buildUnderstanding({ brief, intent: "talent", userPath: "talent" });
  assert.equal(u.path, "talent");
  const line = u.lines.find((l) => l.id === "businessName");
  assert.equal(line?.value, "Ana Cleaning Co");
  for (const locale of ["es", "en"] as const) {
    const html = renderToStaticMarkup(
      createElement(ReadyStep, {
        t: lookup(locale), understanding: u, path: "talent", linkSlug: null, linkAvailable: null, linkSuggestions: [], busy: false,
        onCheckLink: async () => null, onBuild: () => {},
      }),
    );
    assert.ok(html.includes("Ana Cleaning Co"), `${locale}: business name on review`);
  }
});

test("TUL-810: with no business name given, the talent path adds no empty business line", () => {
  const fx = ONBOARDING_FIXTURES.find((f) => f.expect.path === "talent")!;
  const u = buildUnderstanding({ brief: briefFromOnboardingFixture(fx), intent: "talent" });
  if (!fx.expect.known.includes("businessName") && !fx.expect.assumed.includes("businessName")) {
    assert.equal(u.lines.some((l) => l.id === "businessName"), false);
  }
});

// ── TUL-815: time zone reads "Hora de Cancún" and is editable on review ──────

const nine = [{ startMin: 540, endMin: 1140 }];
const week: WeeklyEssentialHours = { "0": [], "1": nine, "2": nine, "3": nine, "4": nine, "5": nine, "6": [] };
const essentials: Essentials = {
  name: "Ana", services: [{ name: "Limpieza" }] as Essentials["services"], hours: week, timezone: "America/Cancun",
  place: { mode: "client", area: null }, firstProviderEmail: null, firstProviderName: null, ownerProvides: true, confirmed: true, source: "manual",
};

test("TUL-815: the zone is named as a place, not an abbreviation", () => {
  assert.equal(timezoneDisplayName("America/Cancun", "es"), "Hora de Cancún");
  assert.equal(timezoneDisplayName("America/Cancun", "en"), "Cancún time");
  assert.equal(timezoneDisplayName("America/Mexico_City", "es"), "Hora de Ciudad de México");
  assert.equal(timezoneDisplayName("America/Bogota", "es"), "Hora de Bogota");
});

test("TUL-815: the review step lets the person change the zone", () => {
  const understanding = {
    path: "talent", pathConfidence: "clear", pathSource: "words", lines: [], followUps: [], typeChip: null, linkName: null, tooLittle: false,
  } as Understanding;
  const render = (editable: boolean) =>
    renderToStaticMarkup(
      createElement(ReadyStep, {
        t: lookup("es"), understanding, path: "talent", linkSlug: null, linkAvailable: null, linkSuggestions: [], busy: false,
        onCheckLink: async () => null, onBuild: () => {}, locale: "es", setupLines: reviewSetupLines(essentials, "es"),
        ...(editable ? { onChangeTimezone: () => {} } : {}),
      }),
    );
  const editable = render(true);
  assert.match(editable, /<select[^>]*data-testid="onb-ready-timezone"/);
  assert.ok(editable.includes("Hora de Cancún"));
  assert.match(editable, /<option value="America\/Cancun" selected="">Hora de Cancún<\/option>/);
  assert.ok(!render(false).includes("<select"));
  assert.ok(render(false).includes("Hora de Cancún"));
  assert.match(src("src/lib/server-actions/onboarding-setup.ts"), /export async function saveOnboardingTimezone/);
});

// ── TUL-818: every "live" line shares the verified answer ───────────────────

test("TUL-818: published but unverified reads 'checking', never 'live'", () => {
  assert.equal(resolveVerifiedLiveBadge({ published: true, verified: undefined }), "checking");
  assert.equal(resolveVerifiedLiveBadge({ published: true, verified: false }), "checking");
  assert.equal(resolveVerifiedLiveBadge({ published: true, verified: true }), "live");
  assert.equal(resolveVerifiedLiveBadge({ published: false, verified: true }), "not_live");
  // No personal site row to check (workspace site): the published flag stands.
  assert.equal(resolveVerifiedLiveBadge({ published: true, verified: null }), "live");
});

test("TUL-818: Today's quality card and the profile card read the shared badge", () => {
  assert.match(src("src/components/admin/shell/internal/talent/agenda/AgendaTodayPage.tsx"), /useVerifiedLiveBadge\(sitePublished\)/);
  assert.match(src("src/components/admin/shell/internal/talent/pages/ProfileEditorPanel.tsx"), /useVerifiedLiveBadge\(flow\.state === "published"\)/);
});

// ── TUL-819: the draft screen names what the check saw ───────────────────────

const draftInput = {
  path: "talent" as const, stamp: null, person: { name: "QA", city: "Playa del Carmen" }, businessName: null, services: 1,
  site: null,
  talent: { publicUrl: null, todayUrl: "https://app.staging.tulala.digital/talent/today", siteUrl: "https://qa.staging.tulala.digital" },
};

test("TUL-819: the HTTP status is kept and named", () => {
  const a = arrivalFromStamp({ ...draftInput, liveCheck: { ok: false, reason: "status", status: 404 }, published: false });
  assert.equal(a.draftStatus, 404);
  assert.deepEqual(draftSawKey(a), { key: "public.onboarding.arrival.draftSaw.status", status: 404 });
  assert.equal(draftSupportLine(a), "draft_saved · status · HTTP 404");
  const retry = applyRetryCheck(a, { ok: false, reason: "name_missing" });
  assert.equal(retry.draftStatus, undefined);
  assert.equal(draftSawKey(retry).key, "public.onboarding.arrival.draftSaw.nameMissing");
});

for (const locale of ["es", "en"] as const) {
  test(`TUL-819 (${locale}): the draft screen shows the concrete finding and a support line that is not just 'failed'`, () => {
    const a = arrivalFromStamp({ ...draftInput, liveCheck: { ok: false, reason: "status", status: 404 }, published: false });
    const html = renderToStaticMarkup(createElement(ArrivalStep, { t: lookup(locale), arrival: a, onRetry: () => {} }));
    assert.match(html, /data-testid="onb-arrival-saw"[^>]*>[^<]*404/);
    assert.match(html, /data-testid="onb-arrival-support"[^>]*>draft_saved · status · HTTP 404</);
    assert.equal(html.match(/data-testid="onb-arrival-retry"/g)?.length, 1, "one primary retry");
  });
}

test("TUL-819: every draft reason has a finding in en and es", () => {
  for (const l of ["en", "es"]) {
    const t = lookup(l);
    for (const k of ["status", "statusUnknown", "network", "nameMissing", "noName", "noUrl", "protected"]) {
      const v = t(`public.onboarding.arrival.draftSaw.${k}`);
      assert.ok(v && !v.startsWith("public.onboarding"), `${l}.${k}`);
      assert.ok(!v.includes("\u2014"), "no em dash");
    }
  }
});

// ── TUL-842: the booking phone says it is optional ───────────────────────────

for (const locale of ["es", "en"] as const) {
  test(`TUL-842 (${locale}): the WhatsApp field is labelled optional`, () => {
    const html = renderToStaticMarkup(
      createElement(CatalogWhoContact, {
        es: locale === "es", locale, fallbackCountry: "MX", name: "", phone: "", email: "", setName: () => {}, setPhone: () => {}, setEmail: () => {},
        touched: false, nameValid: true, phoneValid: true, emailValid: true, askAttempted: false, chatPhoneValid: true,
      }),
    );
    const word = locale === "es" ? "(opcional)" : "(optional)";
    assert.match(html, new RegExp(`data-testid="cb-phone-label"[^>]*>(?:Phone|Teléfono) / WhatsApp <i>${word.replace(/[()]/g, "\\$&")}</i>`));
    assert.ok(html.includes(`aria-label="${locale === "es" ? "Teléfono" : "Phone"} / WhatsApp ${word}"`));
    // The required ones are marked the same way, so optional/required reads consistently.
    const req = locale === "es" ? "(obligatorio)" : "(required)";
    assert.ok(html.includes(`data-testid="cb-name-required">${req}</i>`));
    assert.ok(html.includes(`data-testid="cb-email-required">${req}</i>`));
    assert.match(html, /<input aria-required="true"[^>]*data-testid="cb-name"/);
  });
}

// ── TUL-846: a neutral-alt photo filed under another trade never serves ──────

test("TUL-846: a photo whose catalogue type names another trade is dropped even with a neutral caption", () => {
  const base = { alt: { en: "A plated dish", es: "Un plato" }, tags: {}, originTenantId: null };
  const pool = [
    { id: "chef", ...base, businessType: "personal-chef" },
    { id: "hair", ...base, businessType: "hair-salon" },
    { id: "clean", ...base, businessType: "house-cleaner" },
    { id: "neutral", ...base, businessType: null },
  ];
  assert.deepEqual(dropOtherTradeStock(pool, "cleaning", "t1").map((p) => p.id), ["clean", "neutral"]);
});
