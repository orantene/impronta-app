import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * WF-6 — the header regions plan gate has to bite on the SERVER.
 *
 * A UI-only lock is not a gate: the drawer's Regions tab is a client
 * component, and `saveHeaderSectionAction` is a plain server action any signed
 * in staff member of a Free workspace can call directly. The predicate itself
 * is unit-tested in `edit-mode/shell-plan-guard.test.ts`; what this file
 * checks is the thing a unit test of a pure function cannot see — that the
 * action actually CALLS it, before it writes, on the `regions` path.
 *
 * WHAT THIS CANNOT SEE, stated plainly: it reads source text. It proves the
 * guard is present and ordered before the persistence call, not that the
 * runtime plan lookup returns the right tier. That is covered by
 * `builder-capabilities.test.ts` (the plan table) plus the live QA note in the
 * PR. A source-shape test is the honest tool here because standing up
 * Supabase auth + a Free-tier tenant inside a tsx unit lane is not something
 * this repo's test harness does.
 */

const ACTIONS = resolve(
  process.cwd(),
  "src/lib/site-admin/site-header/actions.ts",
);

function saveSectionActionBody(): string {
  const src = readFileSync(ACTIONS, "utf8");
  const start = src.indexOf("export async function saveHeaderSectionAction");
  assert.notEqual(
    start,
    -1,
    "saveHeaderSectionAction was renamed or moved; re-point this guard rather than deleting it",
  );
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

test("saveHeaderSectionAction gates every regions write on the plan", () => {
  const body = saveSectionActionBody();
  assert.match(
    body,
    /isHeaderRegionsEditAllowedForPlan/,
    "the regions save path must consult the plan guard",
  );
  assert.match(
    body,
    /input\.regions !== undefined/,
    "the guard must trigger on any regions write, including clearing it to null",
  );
});

test("the plan check runs BEFORE anything is persisted", () => {
  const body = saveSectionActionBody();
  const guardAt = body.indexOf("isHeaderRegionsEditAllowedForPlan");
  const writeAt = body.indexOf("saveSectionDraftAction");
  const publishAt = body.indexOf("republishSiteShellSnapshot");
  assert.ok(guardAt > -1 && writeAt > -1 && publishAt > -1);
  assert.ok(
    guardAt < writeAt && guardAt < publishAt,
    "the plan guard is positioned after a write; a refused save would still have persisted",
  );
});

test("the refusal reuses the one shared denial message", () => {
  const body = saveSectionActionBody();
  assert.match(body, /HEADER_REGIONS_PLAN_DENIED_REASON/);
  assert.match(body, /code: "PLAN_LOCKED"/);
});

test("the loader reports the plan so the drawer's lock matches the server", () => {
  const src = readFileSync(ACTIONS, "utf8");
  assert.match(
    src,
    /canEditRegions: isHeaderRegionsEditAllowedForPlan\(planTier\)/,
    "loadHeaderConfigAction must resolve canEditRegions from the same predicate",
  );
});
