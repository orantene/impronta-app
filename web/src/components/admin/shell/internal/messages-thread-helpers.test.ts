/**
 * CHARACTERIZATION (GOLDEN) SPEC — messages.tsx stateless thread helpers
 * Phase 0 safety-net for Phase 1c / Phase 2 (remediation-plan-2026-05-19
 * §3 "Test gap" + §1c). Targets: stageStyle, ageLabel, dateGroupKey,
 * renderWithDateGroups (messages.tsx ~L174–260 as of 2026-05-19).
 *
 * ── WHY THIS FILE IS A FROZEN COPY, NOT A DIRECT IMPORT ──────────────
 * 3 of the 4 helpers (stageStyle, dateGroupKey, renderWithDateGroups)
 * are NOT exported from messages.tsx; only `ageLabel` is. messages.tsx
 * is a `"use client"` module whose transitive import graph cannot be
 * loaded by this repo's test runner — verified: `tsx --test` importing
 * it dies with a JSX `Unexpected token '{'` from a transitively-required
 * .tsx (components/messages-mobile/MobileShellStyles.tsx). This Phase 0
 * lane is ALSO forbidden from modifying any source file (zero-collision
 * with the other agents), so we cannot add `export` to surface them.
 *
 * Resolution: the EXACT current implementation of each helper is frozen
 * verbatim below as the behavioral oracle, and every assertion checks an
 * INDEPENDENTLY hand-computed golden value (not the oracle echoing
 * itself). This pins today's contract — quirks included.
 *
 * ── MIGRATION NOTE (for the Phase 1c owner) ─────────────────────────
 * Phase 1c relocates these helpers into `messages/messages-shared.ts`
 * and exports them. At that point: delete the four `FROZEN_*` copies
 * below and import the real functions instead. Every golden assertion
 * here MUST still pass byte-for-byte — that unchanged-green run is the
 * zero-behavior-change proof the plan requires. Do not edit the
 * expected values to make a changed implementation pass.
 *
 * Out of scope for a deterministic node test (covered by the plan's
 * localhost QA bar, not here): the JSX wrapper element, inline styles,
 * sticky positioning, and the concrete COLORS hex values. stageStyle is
 * characterized against a sentinel palette so the string-composition
 * logic (token choice + the `18` alpha suffix + the literal default)
 * is pinned independently of the design tokens.
 *
 * Run: npx tsx --test \
 *   src/components/admin/shell/internal/messages-thread-helpers.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// ════════════════════════════════════════════════════════════════════
// FROZEN COPIES — verbatim from messages.tsx @ 2026-05-19. Do not edit
// to track source drift; instead, post-1c, replace with real imports.
// ════════════════════════════════════════════════════════════════════

type Palette = {
  coral: string;
  amber: string;
  successSoft: string;
  success: string;
  inkMuted: string;
};

// stageStyle, parameterized on the palette (source closes over `COLORS`).
const FROZEN_stageStyle =
  (COLORS: Palette) =>
  (stage: string): { bg: string; fg: string } => {
    switch (stage) {
      case "inquiry":
        return { bg: `${COLORS.coral}18`, fg: COLORS.coral };
      case "hold":
      case "offered":
        return { bg: `${COLORS.amber}18`, fg: COLORS.amber };
      case "booked":
        return { bg: COLORS.successSoft, fg: COLORS.success };
      default:
        return { bg: "rgba(11,11,13,0.06)", fg: COLORS.inkMuted };
    }
  };

const FROZEN_ageLabel = (hrs: number) =>
  hrs < 1 ? "now" : hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;

function FROZEN_dateGroupKey(hrs: number): "today" | "yesterday" | "week" | "older" {
  if (hrs < 24) return "today";
  if (hrs < 48) return "yesterday";
  if (hrs < 24 * 7) return "week";
  return "older";
}

const FROZEN_DATE_GROUP_LABEL: Record<ReturnType<typeof FROZEN_dateGroupKey>, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  older: "Older",
};

// renderWithDateGroups, faithfully reproduced but emitting plain
// descriptor objects instead of JSX <div>. The header/row ORDERING, the
// `bucketSeen` unique-key algorithm, the data-attr marker, and the label
// mapping are preserved exactly — those are what a relocation can break.
type HeaderNode = {
  __header: true;
  key: string;
  "data-tulala-inbox-group-header": true;
  label: string;
};
type RowNode<T> = { __row: true; item: T };

function FROZEN_renderWithDateGroups<T>(
  items: T[],
  getAgeHrs: (item: T) => number,
): Array<HeaderNode | RowNode<T>> {
  const out: Array<HeaderNode | RowNode<T>> = [];
  let lastBucket: ReturnType<typeof FROZEN_dateGroupKey> | null = null;
  const bucketSeen: Record<string, number> = {};
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const b = FROZEN_dateGroupKey(getAgeHrs(item));
    if (b !== lastBucket) {
      bucketSeen[b] = (bucketSeen[b] ?? 0) + 1;
      const headerKey = bucketSeen[b] === 1 ? `hdr-${b}` : `hdr-${b}-${i}`;
      out.push({
        __header: true,
        key: headerKey,
        "data-tulala-inbox-group-header": true,
        label: FROZEN_DATE_GROUP_LABEL[b],
      });
      lastBucket = b;
    }
    out.push({ __row: true, item });
  }
  return out;
}

// Sentinel palette — keeps assertions independent of the real COLORS hex.
const PALETTE: Palette = {
  coral: "<coral>",
  amber: "<amber>",
  successSoft: "<successSoft>",
  success: "<success>",
  inkMuted: "<inkMuted>",
};

// ════════════════════════════════════════════════════════════════════
// GOLDEN ASSERTIONS — independently hand-computed expected values.
// ════════════════════════════════════════════════════════════════════

describe("stageStyle", () => {
  const stageStyle = FROZEN_stageStyle(PALETTE);

  it("'inquiry' → coral token + '18' alpha suffix on bg", () => {
    assert.deepEqual(stageStyle("inquiry"), { bg: "<coral>18", fg: "<coral>" });
  });
  it("'hold' and 'offered' BOTH fall through to the same amber+'18' case", () => {
    assert.deepEqual(stageStyle("hold"), { bg: "<amber>18", fg: "<amber>" });
    assert.deepEqual(stageStyle("offered"), { bg: "<amber>18", fg: "<amber>" });
  });
  it("'booked' → successSoft / success (NO alpha suffix)", () => {
    assert.deepEqual(stageStyle("booked"), { bg: "<successSoft>", fg: "<success>" });
  });
  it("any other stage → hard-coded 'rgba(11,11,13,0.06)' + inkMuted", () => {
    assert.deepEqual(stageStyle("anything-else"), {
      bg: "rgba(11,11,13,0.06)",
      fg: "<inkMuted>",
    });
    assert.deepEqual(stageStyle(""), { bg: "rgba(11,11,13,0.06)", fg: "<inkMuted>" });
    // 'cancelled' is NOT a special case — it hits default.
    assert.deepEqual(stageStyle("cancelled"), {
      bg: "rgba(11,11,13,0.06)",
      fg: "<inkMuted>",
    });
  });
});

describe("ageLabel", () => {
  const cases: Array<[number, string]> = [
    [0, "now"],
    [0.5, "now"],
    [0.999, "now"],
    [1, "1h"],
    [2, "2h"],
    [23, "23h"],
    [23.999, "23.999h"], // QUIRK: non-integer hrs is interpolated verbatim
    [24, "1d"],
    [25, "1d"], // QUIRK: Math.floor(25/24) === 1
    [47, "1d"],
    [48, "2d"],
    [168, "7d"],
    [-1, "now"], // QUIRK: negatives are < 1 → "now"
    [-100, "now"],
  ];
  for (const [hrs, label] of cases) {
    it(`ageLabel(${hrs}) === ${JSON.stringify(label)}`, () => {
      assert.equal(FROZEN_ageLabel(hrs), label);
    });
  }
});

describe("dateGroupKey", () => {
  const cases: Array<[number, string]> = [
    [-1, "today"], // QUIRK: anything < 24 (incl. negative) is "today"
    [0, "today"],
    [23.99, "today"],
    [24, "yesterday"], // boundary: 24 is NOT today
    [47.99, "yesterday"],
    [48, "week"], // boundary: 48 is NOT yesterday
    [167.99, "week"],
    [168, "older"], // boundary: 24*7 is NOT week
    [10000, "older"],
  ];
  for (const [hrs, key] of cases) {
    it(`dateGroupKey(${hrs}) === ${JSON.stringify(key)}`, () => {
      assert.equal(FROZEN_dateGroupKey(hrs), key);
    });
  }
});

describe("renderWithDateGroups", () => {
  it("empty input → empty output", () => {
    assert.deepEqual(FROZEN_renderWithDateGroups<number>([], (h) => h), []);
  });

  it("a run of items in the SAME bucket emits the header only once, at the run start", () => {
    const out = FROZEN_renderWithDateGroups([1, 2, 3], (h) => h); // all "today"
    assert.deepEqual(out, [
      { __header: true, key: "hdr-today", "data-tulala-inbox-group-header": true, label: "Today" },
      { __row: true, item: 1 },
      { __row: true, item: 2 },
      { __row: true, item: 3 },
    ]);
  });

  it("crossing into a new bucket emits a new header; labels come from DATE_GROUP_LABEL", () => {
    const out = FROZEN_renderWithDateGroups([1, 30, 200], (h) => h); // today, yesterday, older
    assert.deepEqual(out, [
      { __header: true, key: "hdr-today", "data-tulala-inbox-group-header": true, label: "Today" },
      { __row: true, item: 1 },
      {
        __header: true,
        key: "hdr-yesterday",
        "data-tulala-inbox-group-header": true,
        label: "Yesterday",
      },
      { __row: true, item: 30 },
      { __header: true, key: "hdr-older", "data-tulala-inbox-group-header": true, label: "Older" },
      { __row: true, item: 200 },
    ]);
  });

  it("a bucket reappearing after a gap gets a de-duplicated key `hdr-<b>-<i>` (i = item index)", () => {
    // today (i0), yesterday (i1), today again (i2): first today header key is
    // `hdr-today`, the SECOND occurrence becomes `hdr-today-2`.
    const out = FROZEN_renderWithDateGroups([1, 30, 2], (h) => h);
    assert.deepEqual(out, [
      { __header: true, key: "hdr-today", "data-tulala-inbox-group-header": true, label: "Today" },
      { __row: true, item: 1 },
      {
        __header: true,
        key: "hdr-yesterday",
        "data-tulala-inbox-group-header": true,
        label: "Yesterday",
      },
      { __row: true, item: 30 },
      {
        __header: true,
        key: "hdr-today-2",
        "data-tulala-inbox-group-header": true,
        label: "Today",
      },
      { __row: true, item: 2 },
    ]);
  });

  it("third reappearance of a bucket keys off its item index, not a running counter", () => {
    // buckets: today, yest, today, yest → second 'today' header at i=2,
    // second 'yesterday' header at i=3.
    const out = FROZEN_renderWithDateGroups([1, 30, 2, 31], (h) => h);
    const headerKeys = out
      .filter((n): n is HeaderNode => "__header" in n)
      .map((n) => n.key);
    assert.deepEqual(headerKeys, ["hdr-today", "hdr-yesterday", "hdr-today-2", "hdr-yesterday-3"]);
  });

  it("getAgeHrs is honored — bucketing uses the accessor, not the raw item", () => {
    const out = FROZEN_renderWithDateGroups([{ age: 5 }, { age: 100 }], (x) => x.age);
    assert.deepEqual(out, [
      { __header: true, key: "hdr-today", "data-tulala-inbox-group-header": true, label: "Today" },
      { __row: true, item: { age: 5 } },
      { __header: true, key: "hdr-week", "data-tulala-inbox-group-header": true, label: "This week" },
      { __row: true, item: { age: 100 } },
    ]);
  });
});
