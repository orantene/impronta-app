import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

/**
 * User-facing copy must not name a Settings path that does not exist.
 *
 * 2026-08-16: seven strings across components, a server action, the ES catalog
 * and the public help page told users to go to "Settings → Roster → Talent
 * types". Verified in prod: the nav item is "Roster & profile fields", and the
 * destination has no per-talent-type control at all. One developer's stale
 * mental model had been copy-pasted for months because nothing asserted it.
 *
 * This test pins the nav labels that copy is allowed to cite. When the settings
 * nav is genuinely renamed, update KNOWN_BAD/one canonical string here and the
 * failure list tells you every place that must move with it.
 */

// Paths that are known-wrong today. Add, never remove, unless the UI changes.
const KNOWN_BAD = [
  "Settings → Roster → Talent types",
  "Settings → Roster → Categories",
  "Ajustes → Lista → Talent Types",
];

function grepRepo(needle: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-rIl", "--", needle, "--", "src"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch (err) {
    // git grep exits 1 when there are no matches — that is the passing case.
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

describe("settings path copy", () => {
  for (const bad of KNOWN_BAD) {
    it(`no user-facing copy cites "${bad}"`, () => {
      const hits = grepRepo(bad).filter((f) => !f.endsWith(__filename.split("/").pop()!));
      assert.deepEqual(
        hits,
        [],
        `"${bad}" is not a real Settings path. Use ` +
          `"Settings → Roster & profile fields → Categories on your site". Found in:\n  ` +
          hits.join("\n  "),
      );
    });
  }

  it("self-check: the matcher would catch a reintroduction", () => {
    // Proves grepRepo actually finds things, so a green run means "absent",
    // not "the search silently returned nothing" (the guards-measuring-nothing trap).
    assert.ok(
      grepRepo("Roster & profile fields").length > 0,
      "expected the canonical path to appear somewhere in src",
    );
  });
});
