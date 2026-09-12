/**
 * The Floor mode of the point of sale, as a person sees it.
 *
 * What this file proves, each by breaking the rule and watching it go red:
 *
 *  1. EVERY REFUSAL IS A SENTENCE, in all three shipped languages, through the
 *     same `floorBoardCopy` + `floorRefusalText` the screen calls. The list of
 *     codes is the visits engine's own union plus the kitchen send's, the
 *     walk-in queue's and the staff reservation's, spelled out here so a code
 *     the engine gains without a sentence is a red test, not a raw word on a
 *     tablet.
 *  2. THE KITCHEN SEND'S TWO ANSWER SHAPES (`reason` from the engine, `error`
 *     from the route guard, a sentence when the session is gone) all land on
 *     a floor code that has a sentence.
 *  3. THE HEADLINE COUNTS A JOINED PAIR ONCE and a blocked table not at all.
 *  4. THE SCREEN RENDERS in every language with no raw catalogue key, every
 *     state named, every time in the VENUE's clock, the board's rail, the
 *     three views and the panel's three tabs.
 *  5. EVERY DISABLED CONTROL CARRIES ITS SENTENCE: the board's words for what
 *     the engine cannot do yet are in every language and are sentences.
 *  6. THE DOOR: the mode is declared built, and the route branches to it.
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
import { floorBoardCopy, floorRefusalText, type FloorRefusalKey } from "@/components/admin/floor/floor-copy";
import { floorSummary, tableTone } from "@/components/admin/floor/floor-model";
import type { FloorBoardData } from "@/components/admin/floor/floor-types";
import { issuesCopy } from "@/components/admin/pos/pos-copy";

import { FloorClient } from "./floor-client";
import { floorCopy } from "./floor-copy";
import { kitchenOutcome } from "./floor-kitchen";

const LOCALES = ["en", "es", "fr"] as const;

/** Every code the floor's actions can return. */
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
  "walkins_off",
  "party_below_minimum",
  "party_above_maximum",
  "no_band_fits_this_party",
  "sold_out",
  "capacity_unavailable",
  "engine_error",
  "reservations_off",
  "time_not_offered",
  "no_offering_configured",
  "no_contact",
  "closed",
  "too_late_today",
];

const ROUTER: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

/** 2026-09-11T02:30:00Z is 20:30 in Mexico City: the probe's "now". */
const PROBE_NOW_ISO = "2026-09-11T02:30:00.000Z";

function data(locale: string, tables: FloorTable[] = PROBE_TABLES): FloorBoardData {
  return {
    locale,
    timeZone: PROBE_TIME_ZONE,
    nowIso: PROBE_NOW_ISO,
    service: { label: "Dinner", startsAtIso: "2026-09-11T00:00:00.000Z", endsAtIso: "2026-09-11T05:30:00.000Z" },
    defaultTurnMinutes: 90,
    tables,
    book: [
      {
        admissionId: "adm-1",
        startsAtIso: "2026-09-11T03:00:00.000Z",
        partySize: 4,
        holderName: "Grupo Alfa",
        spaceCode: null,
        state: "booked",
        lateMinutes: 0,
        seatedAtIso: null,
      },
    ],
    tickets: { "00000000-0000-4000-8000-0000000000b1": { status: "acknowledged", revision: 2 } },
    currencies: { "00000000-0000-4000-8000-0000000000b1": "USD" },
    walkinsEnabled: true,
    waitlistEnabled: false,
    bookable: true,
    partyWaitlist: [],
  };
}

function render(locale: string, tables: FloorTable[] = PROBE_TABLES): string {
  const tr = createTranslator(locale);
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={ROUTER}>
      <FloorClient
        workspaceName="QA Journeys"
        posPath="/qa/admin/pos"
        workspacePath="/qa/admin"
        preparationPath="/qa/admin/preparation"
        cashierName="Ana"
        drawerOpen={false}
        data={data(locale, tables)}
        copy={floorCopy(tr)}
        issuesCopy={issuesCopy(tr)}
        receiptsCopy={{ title: "Receipts", notWired: "receipts note" }}
      />
    </AppRouterContext.Provider>,
  );
}

test("every refusal the floor can meet is a sentence in every language, never the code", () => {
  for (const locale of LOCALES) {
    const copy = floorBoardCopy(createTranslator(locale));
    for (const code of FLOOR_REASONS) {
      const sentence = floorRefusalText(copy, code);
      assert.equal(typeof sentence, "string");
      assert.ok(sentence.length > 12, `${locale}/${code}: "${sentence}" is not a sentence`);
      // "closed" is an English word as well as a code: the leak that matters
      // is the identifier itself, never the word inside a sentence.
      assert.notEqual(sentence, code, `${locale}/${code}: the code is the sentence`);
      assert.ok(!/_/.test(sentence), `${locale}/${code}: an identifier leaked into the sentence`);
      assert.ok(!sentence.startsWith("dashboard."), `${locale}/${code}: a raw catalogue key`);
    }
    // A code the engine could gain tomorrow reads as the generic sentence.
    assert.equal(floorRefusalText(copy, "something_new"), copy.refusal.unavailable);
  }
});

test("every control the engine cannot serve yet is drawn over a sentence, in every language", () => {
  for (const locale of LOCALES) {
    const c = floorBoardCopy(createTranslator(locale));
    const reasons = [
      c.actions.pauseOnlineReason,
      c.popover.changeServerReason,
      c.popover.extendTimeReason,
      c.popover.blockReason,
      c.popover.splitReason,
      c.seat.serverReason,
      c.seat.noShowReason,
      c.walkIn.mobileReason,
      c.walkIn.needsReason,
      c.waiting.offerReason,
      c.waiting.removeReason,
      c.change.joinReason,
      c.change.mergeReason,
      c.move.whyReason,
      c.departed.keepOpenReason,
      c.departed.paidOtherReason,
      c.departed.walkOutReason,
      c.reservation.whereReason,
      c.reservation.noteReason,
    ];
    for (const reason of reasons) {
      assert.ok(reason.length > 20 && /[.!]$/.test(reason), `${locale}: "${reason}" is not a sentence`);
      assert.ok(!reason.startsWith("dashboard."), `${locale}: a raw catalogue key`);
    }
  }
});

test("the kitchen send's answers, in both shapes, land on a code that has a sentence", () => {
  const copy = floorBoardCopy(createTranslator("en"));
  const cases: Array<[Parameters<typeof kitchenOutcome>[0], FloorRefusalKey]> = [
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
      assert.equal(floorRefusalText(copy, outcome.reason), copy.refusal[expected]);
    }
  }
  assert.deepEqual(kitchenOutcome({ ok: true, revision: 3, amended: true }), { ok: true, revision: 3, amended: true });
});

test("the headline counts a joined pair as one seating, every seatable table, and never a blocked one", () => {
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
    { ...base, spaceId: "e", code: "R4", state: "free", visitId: null, orderId: null, partySize: null, blocked: true },
  ];
  assert.deepEqual(floorSummary(joined), { seated: 1, total: 4, arriving: 1, reset: 1 });
  assert.equal(tableTone(joined[4]!), "blocked");
  assert.equal(tableTone(joined[2]!), "reset");
  assert.equal(tableTone(joined[3]!), "arriving");
  const markup = render("en", joined);
  assert.ok(markupIncludesText(markup, "1 of 4 tables seated · 1 arriving · 0 waiting"), markup.slice(0, 400));
  // The joined pair reads as one tile, named as the board names it.
  assert.ok(markupIncludesText(markup, "T2+T3"), "the joined pair is one tile");
  assert.ok(markup.includes('data-floor-tone="blocked"'), "the blocked table is drawn blocked");
});

test("the floor renders in every language: no raw key, the rail, the views, the panel, every state", () => {
  for (const locale of LOCALES) {
    const copy = floorBoardCopy(createTranslator(locale));
    const markup = render(locale);
    assert.ok(!markup.includes("dashboard.pos"), `${locale}: a raw catalogue key leaked`);
    assert.ok(!markup.includes("dashboard.tables"), `${locale}: a raw catalogue key leaked`);
    for (const text of [
      copy.rail.tables,
      copy.rail.orders,
      copy.rail.prep,
      copy.rail.receipts,
      copy.rail.issues,
      copy.title,
      copy.live,
      copy.views.floor,
      copy.views.timeline,
      copy.views.list,
      copy.panel.arriving,
      copy.panel.waiting,
      copy.panel.seated,
      copy.legend.free,
      copy.legend.held,
      copy.legend.needsReset,
      copy.legend.blocked,
      copy.actions.walkIn,
      copy.actions.newReservation,
      copy.actions.pauseOnline,
      copy.actions.pauseOnlineReason,
      // The book's one party is on the Arriving list with its name and size.
      "Grupo Alfa · 4",
    ]) {
      assert.ok(markupIncludesText(markup, text), `${locale}: "${text}" is not on the screen`);
    }
    assert.ok(markup.includes(`aria-label="${copy.railLabel}"`), `${locale}: the rail has no name`);
    assert.ok(markup.includes("QA Journeys"), `${locale}: the workspace is not named`);
    assert.ok(markup.includes("Ana"), `${locale}: the signed-in person is not named`);
  }
});

test("every time on the floor is the VENUE's wall clock, whatever the host process uses", () => {
  // The probe's held table is due at 01:30Z = 19:30 in Mexico City; the tile
  // prints that hour. This process may be in any zone; the markup may not.
  const markup = render("en");
  assert.ok(markup.includes("19:30"), "expected the venue's 19:30 on the held tile");
  assert.ok(!markup.includes("01:30"), "the server's clock leaked onto the floor as 01:30");
  assert.ok(PROBE_DUE_ISO.endsWith("Z"));
});

test("the door: the mode is built, the rail is the board's, and the route branches to the floor", () => {
  assert.equal(POS_MODE_META.floor.built, true, "the floor must be declared built to be offered");
  assert.deepEqual([...POS_MODE_META.floor.destinations], ["tables", "orders", "prep", "receipts", "issues", "messages"]);
  const page = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/page.tsx"),
    "utf8",
  );
  assert.match(page, /mode === "floor"/, "the route must branch on the floor mode");
  assert.match(page, /<FloorScreen/, "and render the floor screen");
  // The client seats, moves, merges, hands over, splits, ends, resets,
  // sends and takes walk-ins through the engine's own actions, never a copy
  // of them. The move is the engine's `visit_transfer` with the version the
  // floor read (Package 1, D-POS-58); a walk-in joins the party waitlist
  // (`floorJoinWaitlist`, Package 3 T08).
  const client = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/floor-client.tsx"),
    "utf8",
  );
  for (const action of ["tablesSeatParty", "visitTransfer", "visitMergeChecks", "visitChangeServer", "visitSplitCheck", "tablesCloseVisit", "tablesResetTable", "posSubmitPrep", "floorJoinWaitlist"]) {
    assert.ok(client.includes(`${action}(`), `the floor must call ${action}`);
  }
  assert.match(client, /expectedVersion:\s*input\.expectedVersion/, "the move carries the version the floor read");
  assert.match(client, /\?mode=counter&order=/, "the check opens in the counter, on the same order");
  for (const file of [
    "src/app/(workspace)/[tenantSlug]/admin/pos/floor-client.tsx",
    "src/components/admin/floor/FloorBoard.tsx",
    "src/components/admin/floor/FloorViews.tsx",
    "src/components/admin/floor/TablePopover.tsx",
    "src/components/admin/floor/floor-tones.ts",
  ]) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), file), "utf8"), /#[0-9a-fA-F]{3,8}\b/, `${file}: no hex colour literal on an admin surface`);
  }
});
