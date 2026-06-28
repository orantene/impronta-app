/**
 * UNIT TEST — project-label.ts (Phase 5 — multi-inquiry PROJECTS model).
 *
 * Pins the project-label derivation: a client-supplied job_name wins; otherwise
 * a "{lineup word} · {short date}" fragment is built (date omitted when absent),
 * and the connector is a middot, never an em dash.
 *
 * Run: npx tsx --test src/lib/inquiry/project-label.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { deriveProjectLabel, shortDateFragment } from "./project-label";

describe("deriveProjectLabel", () => {
  it("uses the job_name when present (trimmed)", () => {
    assert.equal(
      deriveProjectLabel("  Brooklyn editorial  ", {
        lineupWord: "Lineup of 3",
        shortDate: "Jun 28",
      }),
      "Brooklyn editorial",
    );
  });

  it("derives '{lineup} · {date}' when no job_name", () => {
    assert.equal(
      deriveProjectLabel(null, { lineupWord: "Lineup of 3", shortDate: "Jun 28" }),
      "Lineup of 3 · Jun 28",
    );
  });

  it("omits the date when there is none", () => {
    assert.equal(
      deriveProjectLabel("", { lineupWord: "1 talent", shortDate: null }),
      "1 talent",
    );
  });

  it("never emits an em dash in the derived label", () => {
    const label = deriveProjectLabel(undefined, {
      lineupWord: "Lineup of 2",
      shortDate: "Jul 1",
    });
    assert.ok(!label.includes("—") && !label.includes("–"), label);
  });

  it("honors a custom connector", () => {
    assert.equal(
      deriveProjectLabel(null, {
        lineupWord: "Lineup of 2",
        shortDate: "Jul 1",
        connector: " - ",
      }),
      "Lineup of 2 - Jul 1",
    );
  });
});

describe("shortDateFragment", () => {
  it("formats a bare YYYY-MM-DD as a short month/day fragment (en)", () => {
    assert.equal(shortDateFragment("2026-06-28", "en"), "Jun 28");
  });

  it("returns null for null / unparseable input", () => {
    assert.equal(shortDateFragment(null, "en"), null);
    assert.equal(shortDateFragment("not-a-date", "en"), null);
  });
});
