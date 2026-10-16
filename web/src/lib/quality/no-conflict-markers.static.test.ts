/**
 * TUL-636: no merge-conflict markers in any tracked text file.
 *
 * Batch 6 was pushed with `<<<<<<<` / `>>>>>>>` lines in it (2026-10-08), and
 * hand-merges of the append-only lane lists keep producing them. The old manual
 * check (`git grep '<<<<<<<'`) also matched a binary PNG, so it was ignored.
 * `git grep -I` skips binary files. Only the opening and closing markers are
 * checked: a bare `=======` line is legitimate Markdown (a setext heading).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("no tracked text file contains a merge-conflict marker", () => {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["grep", "-I", "-n", "-E", "^(<<<<<<<|>>>>>>>) ", "--", ":/"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (err) {
    // git grep exits 1 when nothing matches: that is the passing case.
    if ((err as { status?: number }).status === 1) return;
    throw err;
  }
  assert.equal(out.trim(), "", `merge-conflict markers found:\n${out}`);
});
