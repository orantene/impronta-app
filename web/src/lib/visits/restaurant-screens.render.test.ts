/**
 * The floor and the station board, as a person actually sees them.
 *
 * TWO DEFECTS THIS FILE EXISTS FOR, both shipped and both caught in review:
 *
 *  1. THE WRONG CLOCK. Both screens formatted times with no timezone, so the
 *     same instant rendered as the SERVER's hour in the HTML and the DEVICE's
 *     hour a tick later, and neither was the restaurant's. It cannot be proven
 *     in-process: Node resolves the default Intl zone once at startup, so
 *     setting `process.env.TZ` inside a test measures nothing. So the probe is
 *     rendered in CHILD PROCESSES under different `TZ` values and the markup
 *     is required to be byte-identical.
 *
 *  2. RAW REASON CODES. The station board printed whatever the server action
 *     returned — `invalid_state`, or an English sentence hard-coded in a
 *     server action — into a red box, in every language. Every code both
 *     screens can produce is required here to have its own sentence, in all
 *     three shipped languages, through the SAME function the screen calls.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { createTranslator } from "@/i18n/messages";
import { tablesCopy } from "@/app/(workspace)/[tenantSlug]/admin/tables/tables-copy";
import { refusalText as floorRefusalText } from "@/app/(workspace)/[tenantSlug]/admin/tables/tables-client";
import { preparationCopy } from "@/app/(workspace)/[tenantSlug]/admin/preparation/prep-copy";
import { refusalText as boardRefusalText } from "@/app/(workspace)/[tenantSlug]/admin/preparation/prep-client";
import type { PrepRefusalReason } from "@/app/(workspace)/[tenantSlug]/admin/preparation/actions";

const LOCALES = ["en", "es", "fr"] as const;

/** Every code `tables/actions.ts` and the visits engine below it can return. */
const FLOOR_REASONS = [
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
] as const;

/** Every code `preparation/actions.ts` can return. */
const BOARD_REASONS: readonly PrepRefusalReason[] = [
  "not_found",
  "wrong_tenant",
  "invalid_state",
  "invalid",
  "not_allowed",
  "unavailable",
];

const PROBE = "src/lib/visits/restaurant-render-probe.tsx";

function renderUnder(timeZone: string, locale = "en"): string {
  const result = spawnSync(
    join(process.cwd(), "node_modules", ".bin", "tsx"),
    [PROBE, locale],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        TZ: timeZone,
        RESTAURANT_RENDER_PROBE: "1",
        NODE_OPTIONS: "--require ./scripts/register-server-only-test.cjs",
      },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, `probe failed under TZ=${timeZone}: ${result.stderr}`);
  assert.ok(result.stdout.length > 0, `probe printed nothing under TZ=${timeZone}`);
  return result.stdout;
}

test("the floor and the board render identically whatever clock the server is on", () => {
  // Three zones on three sides of UTC. Under the defect this file exists for,
  // "due back 20:00" rendered as 02:00 here, 11:00 there and 15:00 in the
  // third — one instant, three different sentences, none of them the venue's.
  const utc = renderUnder("UTC");
  const tokyo = renderUnder("Asia/Tokyo");
  const kiritimati = renderUnder("Pacific/Kiritimati");
  assert.equal(tokyo, utc, "the markup changed when the SERVER's timezone changed");
  assert.equal(kiritimati, utc, "the markup changed when the SERVER's timezone changed");
});

test("every time on both screens is the VENUE's wall clock", () => {
  const markup = renderUnder("UTC");
  // The venue is America/Mexico_City; the fixture instants are chosen so the
  // venue hour and the UTC hour cannot be confused for one another.
  for (const venueTime of ["20:00", "19:30", "18:45", "21:15"]) {
    assert.ok(markup.includes(venueTime), `expected the venue's ${venueTime} on the screen`);
  }
  for (const utcTime of ["02:00", "01:30", "00:45", "03:15"]) {
    assert.ok(!markup.includes(utcTime), `the server's clock leaked onto the screen as ${utcTime}`);
  }
});

test("the floor tells a bar tab from a table check", () => {
  // C07. Both read "Occupied"; a host deciding where to seat a party needs to
  // know which of the two an occupied table is.
  const copy = tablesCopy(createTranslator("en"));
  const markup = renderUnder("UTC");
  assert.ok(markup.includes(copy.tabCheck), "an open BAR TAB is not named on the card");
  assert.ok(markup.includes(copy.tableCheck), "an open TABLE CHECK is not named on the card");
  assert.notEqual(copy.tabCheck, copy.tableCheck);
});

test("a table nobody has tapped does not open the move picker", () => {
  // Seen on the QA host: every FREE and HELD card rendered "Move to" with a row
  // of destination buttons under it, because "no visit" and "no table tapped"
  // were both null and read as equal. Those buttons would have sent a move for
  // a visit that does not exist. Only the one occupied table a host taps opens
  // the picker, and on a fresh render nobody has tapped anything.
  const copy = tablesCopy(createTranslator("en"));
  const markup = renderUnder("UTC");
  assert.ok(
    !markup.includes(copy.moveHeading),
    `the move picker rendered on a screen nobody has touched: found "${copy.moveHeading}"`,
  );
});

test("a table ticket says WHICH table, in every language", () => {
  // Two "House pizza × 1" cards both reading "Destination: Table" is a board a
  // cook cannot run. The code the floor prints follows the food.
  for (const locale of ["en", "es", "fr"]) {
    const copy = preparationCopy(createTranslator(locale));
    const markup = renderUnder("UTC", locale);
    // The card leads with the table's code (`T1`) and says what kind of
    // destination it is beside it (`Table · 2 guests`), as the station board draws it.
    const board = markup.split("<!--split-->")[1] ?? "";
    assert.ok(board.includes(">T1</strong>"), `the ${locale} ticket does not lead with its table code`);
    assert.ok(board.includes(copy.destinationTable), `the ${locale} ticket does not say it goes to a table`);
  }
});

test("every floor refusal is a sentence in all three languages, never a code", () => {
  for (const locale of LOCALES) {
    const copy = tablesCopy(createTranslator(locale));
    const seen = new Set<string>();
    for (const reason of FLOOR_REASONS) {
      const sentence = floorRefusalText(copy, reason);
      assert.notEqual(sentence, reason, `${locale}/${reason} rendered the raw code`);
      assert.ok(!sentence.includes("dashboard.tables"), `${locale}/${reason} rendered a dotted key`);
      assert.ok(sentence.trim().length > 0, `${locale}/${reason} rendered nothing`);
      seen.add(sentence);
    }
    // Distinct enough to be useful: `not_found` and `wrong_tenant` deliberately
    // share one sentence (a workspace must not learn another's table exists),
    // and so do the two, so the floor's codes map onto at least this many.
    assert.ok(seen.size >= FLOOR_REASONS.length - 2, `${locale}: refusals collapsed into ${seen.size} sentences`);
  }
});

test("every kitchen refusal is a sentence in all three languages, never a code", () => {
  for (const locale of LOCALES) {
    const copy = preparationCopy(createTranslator(locale));
    for (const reason of BOARD_REASONS) {
      const sentence = boardRefusalText(copy, { ok: false, reason });
      assert.notEqual(sentence, reason, `${locale}/${reason} rendered the raw code`);
      assert.ok(!sentence.includes("dashboard.preparation"), `${locale}/${reason} rendered a dotted key`);
      assert.ok(sentence.trim().length > 0, `${locale}/${reason} rendered nothing`);
    }
    // The board's own hazard: a state refusal that reads like a generic error
    // sends a cook to reload nothing. It has to be its own sentence.
    assert.notEqual(
      boardRefusalText(copy, { ok: false, reason: "invalid_state" }),
      boardRefusalText(copy, { ok: false, reason: "unavailable" }),
      `${locale}: "wrong step" and "something went wrong" are the same sentence`,
    );
  }
});

test("the station board never prints a bare status token", () => {
  // `cancelled` used to render `ticket.status` itself, in English, in every
  // language, because it was the one status with no entry in the copy.
  for (const locale of LOCALES) {
    const copy = preparationCopy(createTranslator(locale));
    assert.notEqual(copy.statusCancelled, "cancelled");
    assert.ok(copy.statusCancelled.trim().length > 0);
  }
});
