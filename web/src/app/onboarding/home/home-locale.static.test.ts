/**
 * QA-bounce (#4004, partial): `/onboarding/home` -- the multi-dashboard
 * "where should we start you?" chooser -- rendered hard-coded English copy
 * regardless of the visitor's session locale, unlike its sibling
 * `/onboarding/role`, which already resolves the request locale through
 * `createTranslator`. This locks in the fix: the page reads its locale the
 * same way, and the English literals it used to hand-roll are gone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const PAGE = path.join(process.cwd(), "src/app/onboarding/home/page.tsx");
const read = () => readFileSync(PAGE, "utf8");

const REMOVED_LITERALS = [
  ">Your home<",
  "Where should we{\" \"}",
  '<span style={{ color: "var(--plt-forest)" }}>start you?</span>',
  "You have both a profile and a workspace. Pick the one to open on sign-in.",
  "Pick the dashboard to open on sign-in. You keep access to the others",
  '"Roster, bookings, payments, and your website."',
  'title="My profile"',
  "Your own bookings, calendar, and earnings, including work through the agencies",
  '"Your own bookings, calendar, and earnings."',
  'title="Booking dashboard"',
  '"The requests you\'ve sent and the talent you\'ve saved."',
  ">Current<",
  "That isn't one of your dashboards.",
  "You don't have that dashboard yet.",
  "Couldn't save your choice. Please try again.",
];

const KEYS = [
  "eyebrow",
  "titleLead",
  "titleHighlight",
  "introHybrid",
  "introSingleSurface",
  "workspaceDescription",
  "talentProfileTitle",
  "talentDescriptionRepresented",
  "talentDescriptionIndependent",
  "clientTitle",
  "clientDescription",
  "current",
  "errorUnknown",
  "errorUnavailable",
  "errorFailed",
];

test("the hand-rolled English literals are gone", () => {
  const src = read();
  for (const lit of REMOVED_LITERALS) {
    assert.ok(!src.includes(lit), `page.tsx still has ${JSON.stringify(lit)}`);
  }
});

test("the page resolves the request locale, like its /onboarding/role sibling", () => {
  const src = read();
  assert.match(src, /getRequestLocale/);
  assert.match(src, /createTranslator/);
  assert.match(src, /t\("public\.onboarding\.home\./);
});

test("every onboarding.home key exists in en and es", () => {
  for (const lang of ["en", "es"]) {
    const json = JSON.parse(
      readFileSync(path.join(process.cwd(), `messages/${lang}.json`), "utf8"),
    );
    for (const k of KEYS) {
      assert.equal(
        typeof json.public?.onboarding?.home?.[k],
        "string",
        `${lang}: public.onboarding.home.${k}`,
      );
    }
  }
});

test("the es entries are not just English left in place", () => {
  const en = JSON.parse(readFileSync(path.join(process.cwd(), "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(path.join(process.cwd(), "messages/es.json"), "utf8"));
  for (const k of KEYS) {
    assert.notEqual(
      es.public.onboarding.home[k],
      en.public.onboarding.home[k],
      `es.public.onboarding.home.${k} reads identical to English`,
    );
  }
});
