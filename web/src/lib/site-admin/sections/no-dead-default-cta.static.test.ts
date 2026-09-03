import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * no-dead-default-cta.static.test.ts — a shipped default may not point at a
 * destination that does not resolve for the workspace that will render it.
 *
 * THIS REPLACES `no-dead-contact-cta.static.test.ts`, which was right about the
 * problem and wrong about three things.
 *
 *   1. It walked only `sections/`. Every one of the thirteen page designs was
 *      outside its reach, and between them they shipped 26 dead hrefs.
 *   2. It banned exactly one path, `/contact`. `/reserve`, `/tickets`,
 *      `/passes`, `/cart/add` and a dozen more were equally dead and unguarded.
 *   3. Its prescribed remedy was itself dead. It told authors to use
 *      `/directory`, and `app/(public)/directory/page.tsx` calls
 *      `assertRosterWorkspace`, which 404s for `workspace_type = "business"`.
 *      So the guard steered seeded CTAs onto a route that 404s for exactly the
 *      tenants it existed to protect. `impronta.ts` still carries fourteen of
 *      them, which is correct only because that design is the agency archetype.
 *
 * So this guard asserts the RESOLVED DESTINATION, per workspace shape, not the
 * spelling of the href. See `incident_guards_green_measuring_nothing`: a guard
 * that pins a string rather than the thing the string resolves to is how six of
 * them stayed green while measuring nothing.
 *
 * THE ROUTING TRUTH IT ENCODES
 * ────────────────────────────
 * On an agency host, `AGENCY_STOREFRONT_PREFIXES` (`lib/saas/surface-allow-list.ts`)
 * admits `/directory`, `/book`, `/t`, `/p`, `/posts`, `/models` and `/share`.
 * Every OTHER single-segment path is rewritten by the proxy to `/p/{slug}` and
 * 404s until the operator creates that page, which a brand-new workspace has
 * not. And of the admitted ones, the roster surfaces additionally require
 * `workspace_type = "talent"`.
 *
 * That leaves a seeded default exactly three honest destinations:
 *   • `?inquiry=open` — the chat cue. Present on every tenant type, needs no
 *     route and no seeding. `DirectoryInquiryUrlSync` reads it, and it is now
 *     mounted inside `AgencyChatLauncherMount` so the reader cannot drift away
 *     from the launcher again.
 *   • a roster route, in a design that is only ever given to a workspace that
 *     represents people.
 *   • `/book`, which is allow-listed for every workspace type.
 */

const SRC = resolve(process.cwd(), "src");
const ROOTS = [
  join(SRC, "lib/site-admin/sections"),
  join(SRC, "lib/site-admin/builder-node/page-designs"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Resolves on every agency host regardless of `workspace_type`. */
const UNIVERSAL = new Set(["/book", "/posts", "/share"]);

/**
 * Resolves ONLY where `rosterEnabled(workspace_type)` is true. A design may use
 * these only if it is listed in `ROSTER_DESIGNS` below.
 */
const ROSTER_ONLY = new Set(["/directory", "/models"]);

/**
 * Designs only ever given to a workspace that represents people, so a roster
 * route resolves in them. Keyed by file, because the picker
 * (`signup-design-pick.ts`) and the industry presets both select by design id
 * and both are gated on `presetRepresentsPeople`.
 */
const ROSTER_DESIGNS = new Set(["builder-node/page-designs/impronta.ts"]);

/**
 * KNOWN-INERT ANCHORS, frozen at exactly the two that exist today.
 *
 * A builder node's id is emitted as `data-builder-node-id`, never as a DOM
 * `id`, and nothing in the repo resolves a hash href, so these scroll nowhere.
 * They are deliberately NOT repointed at the chat: they genuinely want to be
 * in-page jumps, and the anchor mechanism is the Page Builder Director's to
 * build. This list may only ever SHRINK. A third inert anchor is a regression,
 * and the two designs holding these are out of the signup picker's reach until
 * an anchor exists.
 */
const KNOWN_INERT_ANCHORS: ReadonlyArray<string> = [
  "builder-node/page-designs/restaurant-orderable.ts",
  "builder-node/page-designs/store-orderable.ts",
];

/** Files whose job is to OFFER paths, not to ship them as defaults. */
const ALLOWED_FILES = new Set(["lib/site-admin/sections/shared/LinkPicker.tsx"]);

/**
 * Editor-side scaffolding. An `Editor.tsx` renders the section's preview inside
 * the builder, where `#` is the idiom for "this control is not a link". None of
 * it reaches a public page, so it is out of scope by construction rather than
 * by exception.
 */
function isEditorScaffolding(relFile: string): boolean {
  return relFile.endsWith("/Editor.tsx");
}

/**
 * THE SECTION-LIBRARY RATCHET, and the honest reason it exists.
 *
 * Extending this guard to assert resolved destinations exposed 37 dead defaults
 * in the seeded section library, 21 of them `/directory`. They are not a new
 * regression: they are the direct product of the OLD guard, which failed builds
 * for `/contact` and instructed authors to use `/directory` instead. It was
 * enforcing a route that 404s on a business workspace.
 *
 * Fixing them is a real change to every seeded section's call to action and it
 * belongs in its own PR with the Director's sequencing, not smuggled into the
 * page-design fix. So they are frozen here, per file, with an exact budget.
 *
 * THESE NUMBERS ONLY GO DOWN. Lowering one as you fix a file is the point;
 * raising one, or adding a file, is a regression and this test says so.
 */
const SECTION_DEBT: ReadonlyMap<string, number> = new Map([
  ["lib/site-admin/sections/shared/default-content.ts", 25],
  ["lib/site-admin/sections/shared/section-template-starters.ts", 12],
]);

const HREF_RE = /href:\s*"([^"]*)"/g;

type Finding = { file: string; href: string; line: number; why: string };

function classify(href: string, relFile: string): string | null {
  if (href === "") return null;
  // The chat cue and any other query-only href stay on the current path and
  // are prefix-safe: `prefixPublicHref` returns a non-"/" href untouched.
  if (href.startsWith("?")) return null;
  if (/^(https?:|mailto:|tel:)/.test(href)) return null;
  if (href.startsWith("#")) {
    return KNOWN_INERT_ANCHORS.some((f) => relFile.endsWith(f))
      ? null
      : "in-page anchors do not resolve: a builder node id is emitted as data-builder-node-id, never a DOM id";
  }
  if (!href.startsWith("/")) return null;

  const path = href.split(/[?#]/)[0] ?? href;
  // The homepage always resolves, on every workspace type and both host shapes.
  if (path === "/") return null;
  if (UNIVERSAL.has(path)) return null;
  if (ROSTER_ONLY.has(path)) {
    return ROSTER_DESIGNS.has(relFile.replace(/^lib\/site-admin\//, ""))
      ? null
      : `${path} 404s on a business workspace (assertRosterWorkspace); use ?inquiry=open`;
  }
  if (path.startsWith("/t/") || path === "/t") {
    return ROSTER_DESIGNS.has(relFile.replace(/^lib\/site-admin\//, ""))
      ? null
      : "/t is a roster surface and 404s on a business workspace";
  }
  if (path.startsWith("/p/")) return null;
  return `${path} is rewritten to /p${path} by the proxy and 404s until the operator creates that page; use ?inquiry=open`;
}

test("no shipped default points at a destination that does not resolve", () => {
  const findings: Finding[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const relFile = relative(SRC, file);
      if (ALLOWED_FILES.has(relFile) || isEditorScaffolding(relFile)) continue;
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, i) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("*") || trimmedLine.startsWith("//")) return;
        for (const match of line.matchAll(HREF_RE)) {
          const href = match[1] ?? "";
          const why = classify(href, relFile);
          if (why) findings.push({ file: relFile, href, line: i + 1, why });
        }
      });
    }
  }

  const counts = new Map<string, number>();
  const unbudgeted: string[] = [];
  for (const f of findings) {
    counts.set(f.file, (counts.get(f.file) ?? 0) + 1);
    if (!SECTION_DEBT.has(f.file)) {
      unbudgeted.push(`${f.file}:${f.line} "${f.href}" — ${f.why}`);
    }
  }

  assert.deepEqual(unbudgeted, [], "a shipped default points somewhere that does not resolve");

  const overBudget: string[] = [];
  for (const [file, budget] of SECTION_DEBT) {
    const actual = counts.get(file) ?? 0;
    if (actual > budget) overBudget.push(`${file}: ${actual} dead defaults, budget ${budget}`);
    if (actual < budget) {
      overBudget.push(
        `${file}: ${actual} dead defaults, budget ${budget} — you fixed some, now lower the budget to ${actual}`,
      );
    }
  }
  assert.deepEqual(overBudget, []);
});

test("the known-inert anchor list only shrinks", () => {
  // Pinning the count is what makes the list a ratchet rather than a excuse.
  assert.equal(
    KNOWN_INERT_ANCHORS.length,
    2,
    "an anchor was added or removed: removing one is good, add the lowered count here; adding one is a regression",
  );
});

test("the guard actually walks the page designs", () => {
  // The bug this whole file exists to fix was a guard that ran happily over a
  // tree that did not contain the problem. Prove the tree is in scope.
  const files = ROOTS.flatMap((root) => walk(root)).map((f) => relative(SRC, f));
  assert.ok(
    files.some((f) => f.endsWith("builder-node/page-designs/restaurant.ts")),
    "page-designs is not being walked, so this guard measures nothing",
  );
  assert.ok(
    files.some((f) => f.endsWith("lib/site-admin/sections/featured_talent/presets.ts")),
    "sections is not being walked",
  );
});

test("the guard fails on the exact hrefs that shipped before it", () => {
  // Self-test: these are real values from origin/main @ 2e2868ef3. If classify
  // stops rejecting them, the guard has gone green while measuring nothing.
  const restaurant = "builder-node/page-designs/restaurant.ts";
  assert.ok(classify("/reserve", restaurant), "/reserve must be rejected");
  assert.ok(classify("/cart/add", restaurant), "/cart/add must be rejected");
  assert.ok(classify("/contact", restaurant), "/contact must be rejected");
  assert.ok(
    classify("/directory", restaurant),
    "/directory must be rejected outside a roster design: it 404s on business",
  );
  assert.ok(
    classify("#menu", restaurant),
    "a NEW inert anchor must be rejected even though the two existing ones are pinned",
  );

  // And passes the honest ones.
  assert.equal(classify("?inquiry=open", restaurant), null);
  assert.equal(classify("/book", restaurant), null);
  assert.equal(classify("/directory", "lib/site-admin/builder-node/page-designs/impronta.ts"), null);
  assert.equal(classify("#menu", "lib/site-admin/builder-node/page-designs/restaurant-orderable.ts"), null);
});
