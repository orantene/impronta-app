/**
 * TUL-127 — every platform page must carry the Tulala token scope.
 *
 * WHY
 * ───
 * All `--tl-*` / `--plt-*` tokens are declared ONLY under
 * `[data-platform-surface="marketing"]` in globals.css, and the root layout
 * gives <body> `site-theme-dark`. A platform page that reads those tokens (or
 * mounts the onboarding module) outside a wrapper that sets the attribute
 * resolves every token to nothing and paints near-white text on white. That
 * was a production P0 on /start (fixed by adding app/start/layout.tsx).
 *
 * WHAT THIS PINS
 * ──────────────
 * Every page/layout under src/app (tenant, workspace, api and talent-site
 * route groups excluded: they own their own theme scope) whose source reads
 * `var(--tl-` / `var(--plt-` or uses OnboardingModule / StartFlow must have
 * `data-platform-surface="marketing"` (or MarketingShell) in itself or in one
 * of its ancestor layouts below the root layout.
 *
 * Fix an offender by adding a scoped layout.tsx beside the page (see
 * app/start/layout.tsx). Do not grow the allow-list without a ticket.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const APP = join(WEB_ROOT, "src/app");

/** Route groups / dirs that own their theme scope and are out of this guard. */
const EXCLUDED_TOP = new Set(["(workspace)", "api", "%5Ftalent-site", "t", "@modal"]);

/** Known offenders. Each needs a ticket; the test fails if one is fixed (shrink it). */
const ALLOW_LIST = new Map<string, string>([
  // /start renders StartFlow with no scope. Fixed by PR #2591 (adds app/start/layout.tsx);
  // delete this entry when that merges (the stale-entry test below will tell you).
  ["start", "#2591"],
]);

const USES_TOKENS = /var\(--(?:tl|plt)-|\bOnboardingModule\b|\bStartFlow\b/;
const HAS_SCOPE = /data-platform-surface=["']marketing["']|\bMarketingShell\b/;
const ENTRY = /^(page|layout|loading|not-found|error)\.tsx$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (ENTRY.test(e.name)) out.push(p);
  }
  return out;
}

function scoped(file: string): boolean {
  if (HAS_SCOPE.test(readFileSync(file, "utf8"))) return true;
  let dir = dirname(file);
  while (dir !== APP && dir.startsWith(APP)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout) && HAS_SCOPE.test(readFileSync(layout, "utf8"))) return true;
    dir = dirname(dir);
  }
  return false;
}

export function findOffenders(): string[] {
  const offenders = new Set<string>();
  for (const file of walk(APP)) {
    const rel = relative(APP, file).split(sep);
    if (rel.length < 2 || EXCLUDED_TOP.has(rel[0])) continue; // root files are not platform pages
    if (!USES_TOKENS.test(readFileSync(file, "utf8"))) continue;
    if (!scoped(file)) offenders.add(rel[0]);
  }
  return [...offenders].sort();
}

test("platform pages that read Tulala tokens sit inside a data-platform-surface scope", () => {
  const unexpected = findOffenders().filter((d) => !ALLOW_LIST.has(d));
  assert.deepEqual(
    unexpected,
    [],
    `These app/ routes read --tl-/--plt- tokens (or mount the onboarding flow) with no ` +
      `data-platform-surface="marketing" wrapper, so they paint white-on-white under body.site-theme-dark. ` +
      `Add a scoped layout.tsx like app/start/layout.tsx: ${unexpected.join(", ")}`,
  );
});

test("the allow-list holds only real offenders", () => {
  const found = new Set(findOffenders());
  const stale = [...ALLOW_LIST.keys()].filter((d) => !found.has(d));
  assert.deepEqual(stale, [], `fixed, remove from ALLOW_LIST: ${stale.join(", ")}`);
});

test("the guard still sees the wrappers it relies on", () => {
  for (const f of ["(auth)/layout.tsx", "account/brief/layout.tsx", "onboarding/layout.tsx"]) {
    assert.ok(HAS_SCOPE.test(readFileSync(join(APP, f), "utf8")), f);
  }
});
