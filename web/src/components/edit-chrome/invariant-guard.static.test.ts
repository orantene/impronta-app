/**
 * invariant-guard.static.test.ts — T0.1 shared-core invariant CI guard.
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * The Builder Ecosystem program's load-bearing invariant is "every builder
 * improvement is SHARED, never a per-surface fork." Today that invariant is
 * enforced only by code review, and a gap already slipped through (a shared
 * public feature wired to one render branch of a multi-branch surface). This
 * static guard makes the invariant self-enforcing for the editor CORE.
 *
 * It reads the SOURCE TEXT of the editor-core files and FAILS if any of them
 * contains a *surface-literal comparison* — a branch that forks editor behaviour
 * by hard-coding a `BuilderSurfaceKind` literal:
 *
 *   === "homepage"   !== "homepage"
 *   === "talent_page" !== "talent_page"
 *   === "cms_page"    !== "cms_page"
 *   === "site_shell"  !== "site_shell"
 *   === "platform_lab" !== "platform_lab"
 *
 * The smell: when the editor core special-cases a surface by *literal*, a new
 * surface (or a new render branch of an existing one) silently misses the
 * behaviour — exactly the fork the program forbids. The correct shape is a
 * `capabilities`/`config` FLAG resolved per surface (see `config.ts` +
 * `BuilderSurfaceCapabilities`), not an inline literal branch.
 *
 * A small number of literal branches legitimately exist today for mount /
 * gating (e.g. the homepage paints via its storefront body so the in-editor
 * canvas short-circuits on `surfaceKind === "homepage"`). Those are encoded as
 * an explicit ALLOW-LIST (file + literal + count + reason), exactly like
 * `legacy-write-guard.static.test.ts` exempts the homepage adapter — so the
 * guard is GREEN today and only NEW literal branches fail.
 *
 * Scanned files (the editor core):
 *   • src/components/edit-chrome/edit-context.tsx
 *   • src/components/edit-chrome/edit-shell.tsx
 *   • src/lib/site-admin/builder-node/render.tsx
 *   • src/components/edit-chrome/inspectors/*.{ts,tsx}  (excl. *.test.*)
 *
 * WHY FILE-TEXT SCAN (not imports)?
 * ──────────────────────────────────
 * Importing edit-context / edit-shell pulls the React + "use server" + CSS
 * import graph that can't run outside Next.js. Reading the files as plain UTF-8
 * text is zero-overhead and catches the exact violation we care about: a
 * developer forking the editor by surface literal.
 *
 * SELF-CHECK (the matcher MUST work)
 * ───────────────────────────────────
 * Before scanning real files, this test plants a synthetic violation in an
 * in-memory string and asserts the matcher catches it; it also asserts a
 * comment-only mention is NOT flagged after `stripComments()`. If the matcher is
 * broken the self-check fails first, making the test itself trustworthy.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/invariant-guard.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// ── The forbidden pattern ─────────────────────────────────────────────────────

/**
 * Every closed `BuilderSurfaceKind` literal (kept in sync with
 * `surface-kind.ts` — `BUILDER_SURFACE_KINDS`). A NEW surface kind must be added
 * here so the guard keeps covering the full set.
 */
const SURFACE_LITERALS = [
  "homepage",
  "talent_page",
  "platform_lab",
  "cms_page",
  "site_shell",
] as const;

/**
 * Matches a strict-equality comparison against a surface literal, single OR
 * double quoted, e.g.  `=== "homepage"`  or  `!== 'talent_page'`. We deliberately
 * scope to `===` / `!==` (the literal-branch smell) — `switch`/lookup-by-config
 * is the encouraged shape and uses neither.
 */
const SURFACE_LITERAL_RE = new RegExp(
  `[=!]==\\s*["'](${SURFACE_LITERALS.map(escapeRe).join("|")})["']`,
);

/** Per-literal matcher (used to report WHICH literal a line forks on). */
const PER_LITERAL_RE: Record<string, RegExp> = Object.fromEntries(
  SURFACE_LITERALS.map((lit) => [lit, new RegExp(`[=!]==\\s*["']${escapeRe(lit)}["']`)]),
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip single-line (// …) and block (/* … *\/) comments from TS/TSX source
 * before matching, so a file may *document* a surface literal in prose without
 * tripping the guard. The guard catches CODE branches, not comments.
 */
function stripComments(source: string): string {
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  stripped = stripped.replace(/\/\/.*/g, "");
  return stripped;
}

// ── File discovery ────────────────────────────────────────────────────────────

// This file lives at: web/src/components/edit-chrome/
// web/src is 2 levels up: ../..
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(THIS_DIR, "../..");

function isTestFile(filename: string): boolean {
  return filename.includes(".test.");
}

/** Collect *.ts / *.tsx files directly under a dir (non-recursive), skipping tests. */
function collectInspectorFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const ext = extname(entry);
      if ((ext === ".ts" || ext === ".tsx") && !isTestFile(entry)) {
        results.push(full);
      }
    }
  } catch {
    // Directory may not exist in all environments — skip silently.
  }
  return results;
}

const EDIT_CHROME_DIR = join(WEB_SRC, "components/edit-chrome");
const INSPECTORS_DIR = join(EDIT_CHROME_DIR, "inspectors");

/** The editor-core files the invariant covers. */
const SCANNED_FILES: string[] = [
  join(EDIT_CHROME_DIR, "edit-context.tsx"),
  join(EDIT_CHROME_DIR, "edit-shell.tsx"),
  join(WEB_SRC, "lib/site-admin/builder-node/render.tsx"),
  ...collectInspectorFiles(INSPECTORS_DIR),
];

/** Repo-relative path (POSIX separators) — stable allow-list keys + readable logs. */
function relKey(filePath: string): string {
  return relative(WEB_SRC, filePath).split("\\").join("/");
}

// ── Allow-list: existing-legitimate surface literals (file + literal + reason) ─
//
// Each entry exempts a SPECIFIC (file, literal) pair that legitimately exists
// today for mount / gating. The guard is keyed on (relPath, literal) so a NEW
// literal in an allow-listed file — or the SAME literal appearing MORE times
// than recorded — still fails (each entry carries the expected occurrence count).
//
// These were enumerated by scanning `main` at T0.1 time. To allow-list a future
// legit branch, add an entry here with a reason; an unrecorded literal fails CI.

interface AllowEntry {
  /** repo-relative path under web/src */
  file: string;
  /** the surface literal compared against */
  literal: (typeof SURFACE_LITERALS)[number];
  /** how many comment-stripped lines compare against this literal in this file */
  count: number;
  /** why this literal branch is allowed (mount/gating, not a fork) */
  reason: string;
}

const ALLOW_LIST: AllowEntry[] = [
  {
    file: "components/edit-chrome/edit-context.tsx",
    literal: "homepage",
    count: 1,
    reason:
      "Gating: applyPageDesignWithUndo routes the homepage through its authoritative " +
      "server action (Free-plan curated on-ramp + empty-slot composition) while every " +
      "other surface bakes + persists through its own adapter. A surface MOUNT fact, " +
      "not forked editor behaviour. " +
      "RATCHETED DOWN 2 -> 1 (builder-2027 P1 / 1A): the second branch " +
      "short-circuited the ClientBuilderCanvas bridge publish for the homepage, which " +
      "only made sense while NEXT_PUBLIC_BUILDER_CLIENT_CANVAS could be off and the " +
      "homepage body server-rendered its canvas. With that flag deleted the homepage " +
      "body subscribes to the bridge like every other surface, so the carve-out is " +
      "gone and every surface publishes.",
  },
  {
    file: "components/edit-chrome/edit-shell.tsx",
    literal: "homepage",
    count: 1,
    reason:
      "Mount: the homepage paints via its storefront body, so the in-editor freeform " +
      "canvas region is only mounted for non-homepage surfaces (surfaceKind !== \"homepage\").",
  },
  {
    file: "components/edit-chrome/inspectors/builder-node-content.tsx",
    literal: "cms_page",
    count: 2,
    reason:
      "NOT a surface comparison — this matches a node data-binding sourceKey VALUE " +
      "(`dataBinding.sourceKey === \"cms_page\"`, a nav/list data source in the same " +
      "namespace as \"cms_posts\"), not the editor's surfaceKind. Allow-listed because " +
      "the literal collides with a surface kind name; it forks nothing about the surface.",
  },
];

/** Index the allow-list by (relPath, literal) → expected count. */
const ALLOW_INDEX = new Map<string, number>();
for (const e of ALLOW_LIST) {
  ALLOW_INDEX.set(`${e.file}::${e.literal}`, e.count);
}

// ── Self-checks: the matcher MUST work ────────────────────────────────────────

test("[T0.1] self-check: matcher catches a planted surface-literal branch (code, not comment)", () => {
  const planted = stripComments(`
    // surfaceKind === "homepage" — this comment should be stripped, not flagged.
    if (surfaceKind === "homepage") { forkHomepageOnly(); }
  `);
  assert.equal(
    SURFACE_LITERAL_RE.test(planted),
    true,
    "Self-check FAILED: SURFACE_LITERAL_RE did not catch a planted `=== \"homepage\"` branch. " +
      "Fix the matcher before trusting the guard.",
  );
});

test("[T0.1] self-check: matcher catches the !== form too", () => {
  const planted = stripComments(`const x = surfaceKind !== "talent_page";`);
  assert.equal(
    SURFACE_LITERAL_RE.test(planted),
    true,
    "Self-check FAILED: the `!==` form of a surface-literal branch was not caught.",
  );
});

test("[T0.1] self-check: a comment-only surface-literal mention is NOT flagged after stripping", () => {
  const commentOnly = stripComments(`
    /**
     * Historically this forked on surfaceKind === "homepage"; now it uses a flag.
     */
    // Also note: surfaceKind === "platform_lab" used to gate the toolbar.
    const x = 42;
  `);
  assert.equal(
    SURFACE_LITERAL_RE.test(commentOnly),
    false,
    "Comment-only surface-literal mentions should NOT trigger the guard after stripping. " +
      "Check stripComments().",
  );
});

test("[T0.1] self-check: the scan set includes the three named core files", () => {
  const rels = SCANNED_FILES.map(relKey);
  for (const must of [
    "components/edit-chrome/edit-context.tsx",
    "components/edit-chrome/edit-shell.tsx",
    "lib/site-admin/builder-node/render.tsx",
  ]) {
    assert.ok(
      rels.includes(must),
      `Scan set must include ${must}; got:\n${rels.join("\n")}`,
    );
  }
});

test("[T0.1] self-check: inspector files are being scanned", () => {
  const inspectors = SCANNED_FILES.filter((f) =>
    relKey(f).startsWith("components/edit-chrome/inspectors/"),
  );
  assert.ok(
    inspectors.length >= 1,
    `Expected at least 1 inspector file in the scan set; found ${inspectors.length}.`,
  );
});

// ── The real scan ─────────────────────────────────────────────────────────────

test("[T0.1] invariant guard: no NEW surface-literal branch in the editor core", () => {
  const violations: string[] = [];
  /** allow-list keys we actually consumed — so a STALE entry is reported. */
  const consumed = new Set<string>();

  for (const filePath of SCANNED_FILES) {
    const rel = relKey(filePath);
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch (err) {
      violations.push(`[READ ERROR] ${rel}: ${String(err)}`);
      continue;
    }
    const source = stripComments(raw);
    const lines = source.split("\n");

    for (const literal of SURFACE_LITERALS) {
      const re = PER_LITERAL_RE[literal]!;
      // Count occurrences per line (a single line may hold two, e.g. `a || b`).
      const hitLines: number[] = [];
      let totalHits = 0;
      lines.forEach((line, idx) => {
        const matches = line.match(new RegExp(re.source, "g"));
        if (matches) {
          totalHits += matches.length;
          hitLines.push(idx + 1);
        }
      });
      if (totalHits === 0) continue;

      const key = `${rel}::${literal}`;
      const allowed = ALLOW_INDEX.get(key);
      if (allowed === undefined) {
        violations.push(
          `[VIOLATION] ${rel}\n` +
            `  Surface literal: "${literal}" (=== / !==)\n` +
            `  Line(s):         ${hitLines.join(", ")}\n` +
            `  Fix: resolve this per-surface decision via a capabilities/config FLAG\n` +
            `       (see BuilderSurfaceCapabilities in builder-core/config.ts), not an\n` +
            `       inline surface-literal branch. If it is a legitimate mount/gating\n` +
            `       fact, add it to ALLOW_LIST in this test with a reason.`,
        );
      } else {
        consumed.add(key);
        if (totalHits !== allowed) {
          violations.push(
            `[COUNT DRIFT] ${rel}\n` +
              `  Surface literal: "${literal}"\n` +
              `  Allow-listed:    ${allowed} occurrence(s)\n` +
              `  Found:           ${totalHits} occurrence(s) on line(s) ${hitLines.join(", ")}\n` +
              `  A NEW branch on an already-allow-listed (file, literal) pair must be\n` +
              `  justified: update the ALLOW_LIST count + reason, or remove the branch.`,
          );
        }
      }
    }
  }

  // Stale allow-list entries (the branch was removed) — report so the list stays honest.
  for (const key of ALLOW_INDEX.keys()) {
    if (!consumed.has(key)) {
      violations.push(
        `[STALE ALLOW-LIST] ${key}\n` +
          `  This (file, literal) pair is allow-listed but no longer present in the\n` +
          `  source. Remove the entry from ALLOW_LIST.`,
      );
    }
  }

  assert.equal(
    violations.length,
    0,
    "[T0.1] INVARIANT GUARD FAILED — surface-literal editor branch(es) found:\n\n" +
      violations.join("\n\n") +
      "\n\nThe shared-core invariant: surfaces differ ONLY by config/capability flags, " +
      "never by forked editor code. Replace literal branches with a per-surface flag.",
  );
});

// ── Coverage (informational — always passes) ─────────────────────────────────

test("[T0.1] coverage: list scanned files (informational)", () => {
  assert.ok(SCANNED_FILES.length > 0, "Expected at least 1 file in the scan set.");
  for (const f of SCANNED_FILES) {
    process.stdout.write(`  scanned: ${relKey(f)}\n`);
  }
});
