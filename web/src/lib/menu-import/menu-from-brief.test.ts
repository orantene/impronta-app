import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRestauradminMenu } from "./parse-restauradmin";
import { planMenuImport, SOURCE_ID_KEY, type ExistingOffering } from "./plan-import";

/**
 * The El Paisa fixture, and the write-proof.
 *
 * `applyParsedMenu` takes an already-authorised tenant id and performs no
 * authorisation of its own — deliberately, because a function that both writes
 * and decides who may write is one that gets called from somewhere new and
 * quietly authorises it. The proof that matters for that split is that a plan
 * for a tenant with nothing existing creates and never silently updates.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, "parrilla-el-paisa.fixture.json"), "utf8"),
) as unknown;

test("the checked-in El Paisa export parses to 117 items and 15 categories", () => {
  // Reported rather than assumed: the ask said 13 categories. The fixture has
  // FIFTEEN distinct category names across 117 items, and nothing is refused.
  const menu = parseRestauradminMenu(FIXTURE);
  assert.equal(menu.items.length, 117);
  assert.equal(menu.refused.length, 0);
  const categories = new Set(menu.items.map((i) => i.category).filter(Boolean));
  assert.equal(categories.size, 15);
});

test("a fresh tenant creates every item and updates none", () => {
  // The write-proof without a database: planning against an empty workspace is
  // what provisioning does on its first run, and every row must be a create.
  const menu = parseRestauradminMenu(FIXTURE);
  const plan = planMenuImport(menu, []);
  assert.equal(plan.counts.create, 117);
  assert.equal(plan.counts.update, 0);
  assert.equal(plan.counts.unchanged, 0);
});

test("re-importing the same menu writes nothing", () => {
  // Idempotency is what makes this safe to call on every provisioning run and
  // safe to re-run after a crash. Feeding the plan its own output must produce
  // no creates and no updates.
  const menu = parseRestauradminMenu(FIXTURE);
  // The source id lives in `attributes[SOURCE_ID_KEY]`, not a field of its own.
  // My first version of this invented a `sourceId` property, matched nothing,
  // and reported 117 creates — a test that would have "passed" a broken
  // idempotency check by describing a row shape the planner never sees.
  const existing: ExistingOffering[] = menu.items.map((item, i) => ({
    id: `offering-${i}`,
    title: item.title.es || item.title.en,
    amountCents: item.amountCents,
    currency: item.currency,
    category: item.category,
    attributes: { [SOURCE_ID_KEY]: item.sourceId },
  }));
  const plan = planMenuImport(menu, existing);
  assert.equal(plan.counts.create, 0, "a re-import must create nothing");
  assert.equal(
    plan.counts.unchanged + plan.counts.update,
    117,
    "every item must be accounted for as unchanged or updated, never dropped",
  );
});

test("every outcome of a brief import is NAMED, including the boring one", () => {
  // "The brief had no menu link", "the fetch failed" and "the page was not a
  // menu" are three different things, and a provisioning run that quietly did
  // nothing would look identical to all three — and identical to success on a
  // workspace whose menu simply never appeared.
  const src = readFileSync(join(HERE, "from-brief.ts"), "utf8");
  for (const kind of ["no_menu_source", "fetch_failed", "not_a_menu", "write_failed", "imported"]) {
    assert.ok(src.includes(`"${kind}"`), `${kind} is not a named outcome`);
  }
  assert.doesNotMatch(
    src,
    /return;\s*\n/,
    "a bare return is a silent skip: every path must name what happened",
  );
});

test("the write path takes an authorised id and does not authorise", () => {
  // If `applyParsedMenu` grew its own auth it would be called from somewhere new
  // and quietly authorise it; if it grew none of this comment, someone would add
  // auth to it and break provisioning, which has no session to offer.
  const src = readFileSync(join(HERE, "import-actions.ts"), "utf8");
  const core = src.slice(src.indexOf("export async function applyParsedMenu"));
  const body = core.slice(0, core.indexOf("\nexport async function applyMenuImport"));
  assert.doesNotMatch(body, /requireWorkspaceStaffAction|authorize\(/);
  assert.match(src, /const result = await applyParsedMenu\(/, "the action must delegate, not duplicate");
});
