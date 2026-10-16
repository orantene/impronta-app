/**
 * TUL-609: lane file lists are merge-safe and duplicate-free.
 *
 * Long lanes (`test:tenant-isolation` is one 9 KB physical line) conflicted in every wave PR
 * on 2026-10-13 and silently accumulated duplicate paths. The fix: a lane may keep its files in
 * `scripts/lanes/<lane>.txt`, ONE path per line, passed to `scripts/lane-test.cjs` as `@<file>`.
 * Two PRs adding different files now touch different lines and merge cleanly.
 *
 * Pinned here: (1) no lane lists one test path twice, inline or in its list file;
 * (2) lane-test understands `@file`; (3) every list file is one path per line, no duplicates,
 * every entry resolves; (4) the three lanes named on the card use list files; (5) the nightly
 * orphan scan counts list-file entries as covered. Each guard has a self-test.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { WEB_ROOT } from "./supabase-unchecked-read";
import { computeOrphans } from "../../../scripts/ci/list-orphan-tests.mjs";

type LanePaths = {
  readListFile: (arg: string, root?: string) => string[];
  expandListArgs: (args: string[], root?: string) => string[];
  resolveLaneArg: (arg: string, root?: string) => string[];
};
const lanePaths = createRequire(join(WEB_ROOT, "package.json"))("./scripts/lane-paths.cjs") as LanePaths;
const scripts = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;

const TEST_PATH = /\.test\.(?:tsx?|mjs|cjs)$/;
const unquote = (t: string) => t.replace(/^['"]|['"]$/g, "");

/** Every test path a lane names: inline tokens plus the contents of its `@list` files. */
export function laneTestPaths(cmd: string, root = WEB_ROOT): string[] {
  const tokens = cmd.split(/\s+/).map(unquote).filter(Boolean);
  const inline = tokens.filter((t) => TEST_PATH.test(t));
  const lists = tokens.filter((t) => t.startsWith("@"));
  return [...inline, ...lanePaths.expandListArgs(lists, root)];
}

export function duplicatesIn(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const p of paths) (seen.has(p) ? dup : seen).add(p);
  return [...dup].sort();
}

const listFiles = (): string[] => {
  const dir = join(WEB_ROOT, "scripts", "lanes");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".txt")).sort() : [];
};

test("no test lane names the same test file twice", () => {
  const bad = Object.entries(scripts)
    .filter(([lane]) => lane.startsWith("test:"))
    .map(([lane, cmd]) => [lane, duplicatesIn(laneTestPaths(cmd))] as const)
    .filter(([, d]) => d.length > 0)
    .map(([lane, d]) => `${lane}: ${d.join(", ")}`);
  assert.deepEqual(bad, []);
});

test("GUARD BITES: duplicatesIn reports a repeated path and ignores unique ones", () => {
  assert.deepEqual(duplicatesIn(["a.test.ts", "b.test.ts", "a.test.ts"]), ["a.test.ts"]);
  assert.deepEqual(duplicatesIn(["a.test.ts", "b.test.ts"]), []);
});

test("lane-paths reads an @list file: one path per line, comments and blanks skipped", () => {
  const got = lanePaths.readListFile("@scripts/lanes/tenant-isolation.txt");
  assert.ok(got.length > 100, `expected the tenant-isolation list, got ${got.length} entries`);
  assert.ok(got.every((l) => l === l.trim() && l !== "" && !l.startsWith("#")));
  assert.deepEqual(lanePaths.expandListArgs(["src/x.test.ts"]), ["src/x.test.ts"]);
});

test("every scripts/lanes/*.txt is duplicate-free and every entry resolves to a file", () => {
  const files = listFiles();
  assert.ok(files.length >= 3, "the three named lanes keep their files in scripts/lanes");
  for (const f of files) {
    const entries = lanePaths.readListFile(`@scripts/lanes/${f}`);
    assert.deepEqual(duplicatesIn(entries), [], `${f} repeats a path`);
    const missing = entries.filter((e) => lanePaths.resolveLaneArg(e).length === 0);
    assert.deepEqual(missing, [], `${f} names files that do not exist`);
  }
});

test("the long lanes use one-path-per-line list files and run through lane-test.cjs", () => {
  for (const lane of ["tenant-isolation", "auth-routing", "ai-guardrails"]) {
    const cmd = scripts[`test:${lane}`];
    assert.ok(cmd.includes("node scripts/lane-test.cjs"), `${lane} runs through lane-test.cjs`);
    assert.ok(cmd.includes(`@scripts/lanes/${lane}.txt`), `${lane} reads scripts/lanes/${lane}.txt`);
    assert.ok(cmd.length < 400, `${lane} stays short (${cmd.length} chars): its files live in the list`);
  }
});

test("the nightly orphan scan counts list-file entries as covered", () => {
  const orphans = new Set(computeOrphans());
  const listed = listFiles().flatMap((f) => lanePaths.readListFile(`@scripts/lanes/${f}`));
  assert.deepEqual(listed.filter((p) => orphans.has(p)), []);
});

test("TUL-609: a lane-test.cjs lane keeps no long inline path list (use scripts/lanes/<lane>.txt)", () => {
  const inlineLong = Object.entries(scripts)
    .filter(([lane, cmd]) => lane.startsWith("test:") && cmd.includes("scripts/lane-test.cjs"))
    .map(([lane, cmd]) => [lane, cmd.split(/\s+/).map(unquote).filter((t) => TEST_PATH.test(t)).length] as const)
    .filter(([, n]) => n >= 8)
    .map(([lane, n]) => `${lane}: ${n} inline paths`);
  assert.deepEqual(inlineLong, []);
});

// TUL-1185 / TUL-1186: lane lists are kept SORTED (byte order) so PRs insert at different
// places instead of all appending to the end, and `.gitattributes` merges them with `union`.
const laneSort = createRequire(join(WEB_ROOT, "package.json"))("./scripts/lanes-sort.cjs") as {
  sortedText: (raw: string) => string;
};

test("GUARD BITES: sortedText orders by byte, keeps # comments on top and drops repeats", () => {
  assert.equal(laneSort.sortedText("# head\nb.test.ts\na.test.ts\nb.test.ts\n"), "# head\na.test.ts\nb.test.ts\n");
  assert.equal(laneSort.sortedText("Z.test.ts\na.test.ts\n"), "Z.test.ts\na.test.ts\n");
});

test("TUL-1185: every scripts/lanes/*.txt is sorted (fix: npm run lanes:sort)", () => {
  const unsorted = listFiles().filter((f) => {
    const raw = readFileSync(join(WEB_ROOT, "scripts", "lanes", f), "utf8");
    return laneSort.sortedText(raw) !== raw;
  });
  assert.deepEqual(unsorted, []);
});

test("TUL-1186: .gitattributes merges the lane lists with the union driver", () => {
  const attrs = readFileSync(join(WEB_ROOT, "..", ".gitattributes"), "utf8");
  assert.match(attrs, /^web\/scripts\/lanes\/\*\.txt\s+merge=union$/m);
});
