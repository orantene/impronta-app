/**
 * CHARACTERIZATION (GOLDEN) SPEC — messages.tsx stateless thread helpers
 * Phase 0 safety-net for Phase 1c / Phase 2 (remediation-plan-2026-05-19
 * §3 "Test gap" + §1c). Targets: stageStyle, ageLabel, dateGroupKey,
 * renderWithDateGroups.
 *
 * ── REPOINTED 2026-05-19 (Phase 1c) ─────────────────────────────────
 * Phase 1c relocated these four helpers, byte-for-byte, out of the
 * un-importable `"use client"` messages.tsx into
 * `messages/messages-shared.tsx` and exported them. This spec now imports
 * and exercises the REAL relocated functions (no frozen duplicates that
 * could silently drift). Every golden expected value below is UNCHANGED
 * from the pre-1c frozen-oracle run — that unchanged-green run is the
 * zero-behavior-change proof the plan requires.
 *
 * Two of the four cannot be deep-equal-checked directly in a node test
 * and keep thin, faithful *representation adapters* (logic untouched —
 * they only translate the real output's SHAPE back to the value the
 * golden assertion already expected):
 *   • stageStyle closes over the real design-token `COLORS`. The adapter
 *     calls the real function, then maps the real hex tokens back to the
 *     sentinel names (`<coral>` …) the golden values use, so the token
 *     choice, the `18` alpha suffix, the hard-coded `rgba(11,11,13,0.06)`
 *     default and the hold/offered/cancelled quirks are all still pinned.
 *   • renderWithDateGroups emits JSX `<div>` headers + takes a renderRow.
 *     The adapter passes a sentinel renderRow and maps the real header
 *     elements (.key / .props / data-attr / single text child) to the
 *     descriptor objects the golden values use — the header/row ordering,
 *     the `bucketSeen` `hdr-<b>` / `hdr-<b>-<i>` keying, the marker and
 *     the DATE_GROUP_LABEL mapping are all still pinned.
 * ageLabel and dateGroupKey are pure → asserted against the real
 * functions directly, expected values byte-for-byte unchanged.
 *
 * Run: npx tsx --test \
 *   src/components/admin/shell/internal/messages-thread-helpers.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// REAL relocated helpers under test (Phase 1c — messages/messages-shared).
import {
  stageStyle as realStageStyle,
  ageLabel,
  dateGroupKey,
  renderWithDateGroups as realRenderWithDateGroups,
} from "./messages/messages-shared";
// The real design tokens stageStyle genuinely closes over.
import { COLORS } from "./state";

// ════════════════════════════════════════════════════════════════════
// FAITHFUL REPRESENTATION ADAPTERS — translate real output SHAPE only.
// No helper logic is reimplemented here; the real functions are called.
// ════════════════════════════════════════════════════════════════════

type Palette = {
  coral: string;
  amber: string;
  successSoft: string;
  success: string;
  inkMuted: string;
};

// Sentinel names the golden stageStyle assertions are written against.
const PALETTE: Palette = {
  coral: "<coral>",
  amber: "<amber>",
  successSoft: "<successSoft>",
  success: "<success>",
  inkMuted: "<inkMuted>",
};

// Map real COLORS hex → sentinel. Longest hex first so a value that is a
// substring of another (e.g. success ⊂ successSoft) can't partial-replace.
const HEX_TO_SENTINEL: Array<[string, string]> = (
  [
    [COLORS.coral, PALETTE.coral],
    [COLORS.amber, PALETTE.amber],
    [COLORS.successSoft, PALETTE.successSoft],
    [COLORS.success, PALETTE.success],
    [COLORS.inkMuted, PALETTE.inkMuted],
  ] as Array<[string, string]>
).sort((a, b) => b[0].length - a[0].length);

function toSentinel(v: string): string {
  let out = v;
  for (const [hex, name] of HEX_TO_SENTINEL) out = out.split(hex).join(name);
  return out;
}

// Calls the REAL stageStyle, re-expresses its real-token output in the
// sentinel vocabulary the golden values use. `rgba(11,11,13,0.06)` has no
// COLORS entry → passes through verbatim (the pinned literal default).
function stageStyleRepr(stage: string): { bg: string; fg: string } {
  const r = realStageStyle(stage);
  return { bg: toSentinel(r.bg), fg: toSentinel(r.fg) };
}

type HeaderNode = {
  __header: true;
  key: string;
  "data-tulala-inbox-group-header": true;
  label: string;
};
type RowNode<T> = { __row: true; item: T };

// Calls the REAL renderWithDateGroups with a sentinel renderRow, then maps
// the real React <div> header elements back to the descriptor objects the
// golden values use (key, the data-attr marker, the single text child).
function renderWithDateGroups<T>(
  items: T[],
  getAgeHrs: (item: T) => number,
): Array<HeaderNode | RowNode<T>> {
  const nodes = realRenderWithDateGroups(
    items,
    getAgeHrs,
    (item: T) => ({ __row: true, item } as RowNode<T>),
  ) as unknown as Array<
    RowNode<T> | { key: string; props: Record<string, unknown> }
  >;
  return nodes.map((n) => {
    if (
      n &&
      typeof n === "object" &&
      "props" in n &&
      n.props &&
      (n.props as Record<string, unknown>)["data-tulala-inbox-group-header"] === true
    ) {
      return {
        __header: true,
        key: (n as { key: string }).key,
        "data-tulala-inbox-group-header": true,
        label: (n.props as Record<string, unknown>).children as string,
      } as HeaderNode;
    }
    return n as RowNode<T>;
  });
}

// ════════════════════════════════════════════════════════════════════
// GOLDEN ASSERTIONS — independently hand-computed expected values.
// Byte-for-byte unchanged from the pre-1c frozen-oracle spec.
// ════════════════════════════════════════════════════════════════════

describe("stageStyle", () => {
  const stageStyle = stageStyleRepr;

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
      assert.equal(ageLabel(hrs), label);
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
      assert.equal(dateGroupKey(hrs), key);
    });
  }
});

describe("renderWithDateGroups", () => {
  it("empty input → empty output", () => {
    assert.deepEqual(renderWithDateGroups<number>([], (h) => h), []);
  });

  it("a run of items in the SAME bucket emits the header only once, at the run start", () => {
    const out = renderWithDateGroups([1, 2, 3], (h) => h); // all "today"
    assert.deepEqual(out, [
      { __header: true, key: "hdr-today", "data-tulala-inbox-group-header": true, label: "Today" },
      { __row: true, item: 1 },
      { __row: true, item: 2 },
      { __row: true, item: 3 },
    ]);
  });

  it("crossing into a new bucket emits a new header; labels come from DATE_GROUP_LABEL", () => {
    const out = renderWithDateGroups([1, 30, 200], (h) => h); // today, yesterday, older
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
    const out = renderWithDateGroups([1, 30, 2], (h) => h);
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
    const out = renderWithDateGroups([1, 30, 2, 31], (h) => h);
    const headerKeys = out
      .filter((n): n is HeaderNode => "__header" in n)
      .map((n) => n.key);
    assert.deepEqual(headerKeys, ["hdr-today", "hdr-yesterday", "hdr-today-2", "hdr-yesterday-3"]);
  });

  it("getAgeHrs is honored — bucketing uses the accessor, not the raw item", () => {
    const out = renderWithDateGroups([{ age: 5 }, { age: 100 }], (x) => x.age);
    assert.deepEqual(out, [
      { __header: true, key: "hdr-today", "data-tulala-inbox-group-header": true, label: "Today" },
      { __row: true, item: { age: 5 } },
      { __header: true, key: "hdr-week", "data-tulala-inbox-group-header": true, label: "This week" },
      { __row: true, item: { age: 100 } },
    ]);
  });
});
