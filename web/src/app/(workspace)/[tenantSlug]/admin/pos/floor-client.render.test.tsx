/**
 * The Floor mode of the point of sale, as a person sees it.
 *
 * What this file proves, each by breaking the rule and watching it go red:
 *
 *  1. EVERY REFUSAL IS A SENTENCE, in all three shipped languages, through the
 *     same `floorCopy` + `refusalText` the screen calls. The list of codes is
 *     the visits engine's own union plus the kitchen send's, spelled out here
 *     so a code the engine gains without a sentence is a red test, not a raw
 *     word on a tablet.
 *  2. THE KITCHEN SEND'S TWO ANSWER SHAPES (`reason` from the engine, `error`
 *     from the route guard, a sentence when the session is gone) all land on
 *     a floor code that has a sentence.
 *  3. THE HEADLINE COUNTS A JOINED PAIR ONCE.
 *  4. THE SCREEN RENDERS in every language with no raw catalogue key, every
 *     state named, every time in the VENUE's clock, and the rail's two rows.
 *  5. THE DOOR: the mode is declared built, and the route branches to it.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { createTranslator } from "@/i18n/messages";
import { POS_MODE_META } from "@/lib/pos/modes";
import type { FloorTable } from "@/lib/visits/floor";
import {
  PROBE_ARRIVING_ISO,
  PROBE_DUE_ISO,
  PROBE_TABLES,
  PROBE_TIME_ZONE,
  PROBE_VACATED_ISO,
} from "@/lib/visits/restaurant-render-probe";
import { markupIncludesText } from "@/components/admin/pos/test-html-helpers";

import {
  FloorClient,
  floorSummary,
  kitchenLine,
  kitchenOutcome,
  refusalText,
  type FloorRefusalKey,
} from "./floor-client";
import { floorCopy } from "./floor-copy";

const LOCALES = ["en", "es", "fr"] as const;

/** Every code `tables/actions.ts`, the visits engine, and the kitchen send can return. */
const FLOOR_REASONS: readonly FloorRefusalKey[] = [
  "not_found",
  "wrong_tenant",
  "already_open",
  "invalid",
  "party_too_small",
  "party_too_large",
  "not_combinable",
  "joined_unavailable",
  "joined_visit",
  "not_open",
  "outstanding",
  "already_closed",
  "version_conflict",
  "not_allowed",
  "unavailable",
  "reservation_not_found",
  "reservation_other_table",
  "reservation_not_valid",
  "reservation_already_seated",
  "kitchen_empty",
  "kitchen_not_found",
];

const ROUTER: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

function render(locale: string, tables: FloorTable[] = PROBE_TABLES): string {
  const tr = createTranslator(locale);
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={ROUTER}>
      <FloorClient
        workspaceName="QA Journeys"
        posPath="/qa/admin/pos"
        locale={locale}
        timeZone={PROBE_TIME_ZONE}
        zoneNote="zone note"
        tables={tables}
        tickets={{ "00000000-0000-4000-8000-0000000000b1": { status: "acknowledged", revision: 2 } }}
        currencies={{ "00000000-0000-4000-8000-0000000000b1": "USD" }}
        copy={floorCopy(tr)}
      />
    </AppRouterContext.Provider>,
  );
}

test("every refusal the floor can meet is a sentence in every language, never the code", () => {
  for (const locale of LOCALES) {
    const copy = floorCopy(createTranslator(locale));
    for (const code of FLOOR_REASONS) {
      const sentence = refusalText(copy, code);
      assert.equal(typeof sentence, "string");
      assert.ok(sentence.length > 12, `${locale}/${code}: "${sentence}" is not a sentence`);
      assert.ok(!sentence.includes(code), `${locale}/${code}: the code leaked into the sentence`);
      assert.ok(!/_/.test(sentence), `${locale}/${code}: an identifier leaked into the sentence`);
      assert.ok(!sentence.startsWith("dashboard."), `${locale}/${code}: raw catalogue key`);
      assert.ok(!sentence.includes("—"), `${locale}/${code}: em dash in user-facing copy`);
    }
    // The kitchen's two sentences are the floor's own, not the generic one.
    assert.notEqual(refusalText(copy, "kitchen_empty"), copy.refusal.unavailable);
    assert.notEqual(refusalText(copy, "kitchen_not_found"), copy.refusal.unavailable);
    // An unknown code reads as the generic sentence, never raw.
    assert.equal(refusalText(copy, "something_new"), copy.refusal.unavailable);
  }
});

test("the kitchen send's answers, in both shapes, land on a code with a sentence", () => {
  const copy = floorCopy(createTranslator("en"));
  const cases: Array<[{ ok: boolean; reason?: unknown; error?: unknown }, FloorRefusalKey]> = [
    [{ ok: false, reason: "empty", error: "Add items before sending to preparation." }, "kitchen_empty"],
    [{ ok: false, reason: "not_found", error: "Sale not found." }, "kitchen_not_found"],
    [{ ok: false, reason: "wrong_tenant", error: "Sale not found." }, "kitchen_not_found"],
    [{ ok: false, reason: "unavailable", error: "Could not send to preparation." }, "unavailable"],
    [{ ok: false, error: "not_allowed" }, "not_allowed"],
    [{ ok: false, error: "invalid" }, "invalid"],
    // The guard's own English sentence when the session is gone: never printed.
    [{ ok: false, error: "You must be signed in." }, "unavailable"],
  ];
  for (const [result, expected] of cases) {
    const outcome = kitchenOutcome(result);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.reason, expected);
      assert.equal(refusalText(copy, outcome.reason), copy.refusal[expected]);
    }
  }
  const sent: { ok: boolean; reason?: unknown; error?: unknown; revision: number } = { ok: true, revision: 1 };
  assert.deepEqual(kitchenOutcome(sent), { ok: true });
});

test("the headline counts a joined pair as one seating and every table as a table", () => {
  const base = PROBE_TABLES[0];
  assert.ok(base, "the probe carries at least one table");
  const joined: FloorTable[] = [
    { ...base, spaceId: "a", code: "T2", joinedWithSpaceId: "b", joinedFromSpaceId: null },
    { ...base, spaceId: "b", code: "T3", joinedWithSpaceId: null, joinedFromSpaceId: "a" },
    {
      ...base,
      spaceId: "c",
      code: "T4",
      state: "free",
      visitId: null,
      orderId: null,
      partySize: null,
      needsResetSinceIso: PROBE_VACATED_ISO,
    },
    {
      ...base,
      spaceId: "d",
      code: "T5",
      state: "held",
      visitId: null,
      orderId: null,
      partySize: null,
      held: { admissionId: "adm", holderName: "Ana", partySize: 2, startsAtIso: PROBE_ARRIVING_ISO, late: false },
    },
  ];
  assert.deepEqual(floorSummary(joined), { seated: 1, total: 4, arriving: 1, reset: 1 });
  const markup = render("en", joined);
  assert.ok(markup.includes("1 of 4 tables seated · 1 arriving · 1 need reset"), markup.slice(0, 400));
});

test("the floor renders in every language: no raw key, every state named, the rail's two rows", () => {
  for (const locale of LOCALES) {
    const copy = floorCopy(createTranslator(locale));
    const markup = render(locale);
    assert.ok(!markup.includes("dashboard.pos"), `${locale}: a raw catalogue key leaked`);
    assert.ok(!markup.includes("dashboard.tables"), `${locale}: a raw catalogue key leaked`);
    for (const text of [
      copy.rail.tables,
      copy.rail.seating,
      copy.title,
      copy.state.occupied,
      copy.state.free,
      copy.state.held,
      copy.state.needsReset,
      copy.state.tableCheck,
      copy.state.tabCheck,
      copy.tapHint,
      kitchenLine(copy, { status: "acknowledged", revision: 2 }),
      // BAR1 is an open tab with no check yet: it says so, and no kitchen line.
      copy.noCheckYet,
    ]) {
      assert.ok(markupIncludesText(markup, text), `${locale}: "${text}" is not on the screen`);
    }
    // The rail is the mode's own, from the vocabulary, and names itself.
    assert.ok(markup.includes(`aria-label="${copy.railLabel}"`), `${locale}: the rail has no name`);
    assert.ok(markup.includes("QA Journeys"), `${locale}: the workspace is not named`);
    assert.ok(markup.includes("zone note"), `${locale}: the venue's zone is not written`);
  }
});

test("every time on the floor is the VENUE's wall clock, whatever the host process uses", () => {
  // The probe instants are 02:00Z / 01:30Z / 00:45Z, which are 20:00 / 19:30 /
  // 18:45 in Mexico City. This process may be in any zone; the markup may not.
  const markup = render("en");
  for (const venueTime of ["20:00", "19:30", "18:45"]) {
    assert.ok(markup.includes(venueTime), `expected the venue's ${venueTime} on the floor`);
  }
  for (const utcTime of ["02:00", "01:30", "00:45"]) {
    assert.ok(!markup.includes(utcTime), `the server's clock leaked onto the floor as ${utcTime}`);
  }
  assert.ok(PROBE_DUE_ISO.endsWith("Z"));
});

test("the floor prints a check's total in the check's own currency and says what the kitchen is doing", () => {
  const markup = render("en");
  // The probe's occupied T1 carries order …b1 with a 0-cent total in USD.
  assert.ok(markupIncludesText(markup, "Check $0.00"), "the check total is not on the card");
  assert.ok(
    markupIncludesText(markup, "Kitchen: acknowledged (revision 2)"),
    "the kitchen's step is not on the card",
  );
});

test("the door: the mode is built and the route branches to the floor", () => {
  assert.equal(POS_MODE_META.floor.built, true, "the floor must be declared built to be offered");
  assert.deepEqual([...POS_MODE_META.floor.destinations], ["tables", "seating"]);
  const page = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx"),
    "utf8",
  );
  assert.match(page, /mode === "floor"/, "the route must branch on the floor mode");
  assert.match(page, /<FloorScreen/, "and render the floor screen");
  // The client seats, moves, ends, resets and sends through the engine's own
  // actions, never a copy of them.
  const client = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/floor-client.tsx"),
    "utf8",
  );
  for (const action of ["tablesSeatParty", "tablesMoveVisit", "tablesCloseVisit", "tablesResetTable", "posSubmitPrep"]) {
    assert.ok(client.includes(`${action}(`), `the floor must call ${action}`);
  }
  assert.match(client, /\?mode=counter&order=/, "the check opens in the counter, on the same order");
  assert.doesNotMatch(client, /#[0-9a-fA-F]{3,8}\b/, "no hex colour literal on an admin surface");
});
