/**
 * The guarantees `menu-order-engine.ts` carried, now that it is gone.
 *
 * Three static guards pinned that engine's SOURCE TEXT. Deleting the file
 * without them would have quietly dropped three real protections — and leaving
 * them would have reddened main on a clean deletion, which this repo has
 * recorded before ("a guard pinning source text reddened main on a clean
 * refactor"). So they are repointed, not deleted, and where the behaviour is
 * now covered by a REAL test rather than a source scan, this says so instead of
 * scanning again.
 *
 * What each one was protecting:
 *
 *   payment policy — the engine had to DERIVE payInPerson rather than trust the
 *     client's field. That is now `purchase-policy.ts`, enforced by 16 real
 *     tests including "pay in person is REFUSED when the offering forbids it".
 *     A behavioural test beats a source scan, so no scan is re-added here.
 *
 *   no slots — a menu order must never touch talent holds or booking slots. A
 *     taco has no call time, and the engine's `starts_at = ends_at = now()`
 *     calendar placeholder existed because it was forced through a spine that
 *     demanded one. Still worth pinning: the pipeline serves every channel, so
 *     a future edit for appointments could reach into slots for everyone.
 *
 *   stock — gated on inventory, never on `kind === 'product'`. That gate is the
 *     bug that let the 12-spot course oversell. Capacity owns it now and the
 *     pipeline calls their RPCs, so the guard is that the pipeline does not
 *     reach for the old lossy shim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import path from "node:path";

/** Pin behaviour, not prose. A guard that reads comments fires on its own docs. */
/**
 * `blankComments` from `lib/quality`, not a local regex.
 *
 * The local one this replaces could not tell a `//` inside a string literal
 * from a comment, and a second comment-stripper is the duplication this phase
 * has been removing. Same helper the capacity stock guard now uses.
 */
const stripComments = blankComments;

/**
 * The WHOLE pipeline, not one named file.
 *
 * This read `src/lib/orders/purchase.ts` by name, and the 800-line split moved
 * half the pipeline into `purchase-catalog.ts` — so every assertion below
 * silently narrowed to the half that stayed. A `release_offering_stock` call,
 * a `talent_holds` write or a `starts_at` stamp added to the sibling would
 * have passed every test in this file.
 *
 * The split caused it, but the weakness predates the split: a guard pinned to
 * a filename measures a LOCATION, not an invariant. Fourth instance tonight,
 * and the one I should have caught, because I had just fixed the identical
 * bug in `capacity/offering-stock-gate.test.ts` two directories away.
 */
const PIPELINE_DIR = path.join(process.cwd(), "src/lib/orders");
const PIPELINE = readdirSync(PIPELINE_DIR)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => stripComments(readFileSync(path.join(PIPELINE_DIR, f), "utf8")))
  .join("\n");

test("the engine and its call site are gone", () => {
  for (const gone of ["src/lib/inquiry/menu-order-engine.ts"]) {
    let exists = true;
    try {
      readFileSync(path.join(process.cwd(), gone), "utf8");
    } catch {
      exists = false;
    }
    assert.equal(exists, false, `${gone} should have been deleted with the re-home`);
  }
  const action = readFileSync(
    path.join(process.cwd(), "src/app/(public)/_menu/menu-order-actions.ts"),
    "utf8",
  );
  assert.match(action, /createPurchase/, "the menu action must call the pipeline");
  assert.doesNotMatch(action, /createMenuOrder/, "the old engine must not be called");
});

test("the menu path no longer provisions an auth user for a guest", () => {
  // Comments stripped: this file EXPLAINS the provisioner it no longer calls,
  // and a guard that cannot tell an explanation from a call is a guard that
  // fires on its own documentation.
  const action = stripComments(
    readFileSync(
      path.join(process.cwd(), "src/app/(public)/_menu/menu-order-actions.ts"),
      "utf8",
    ),
  );
  // Seven of production's thirty-one auth identities are
  // `menu-qa-<timestamp>@example.com`, minted by this path on every QA run.
  assert.doesNotMatch(
    action,
    /ensureGuestClientByEmail/,
    "the menu order path must not mint an auth.users row for a guest",
  );
});

test("the pipeline never touches talent holds or booking slots", () => {
  // A taco has no call time. The engine stamped `starts_at = ends_at = now()`
  // only because the spine it was forced through demanded one.
  assert.ok(!PIPELINE.includes('.from("talent_holds")'), "pipeline must not write talent_holds");
  assert.ok(!PIPELINE.includes('.from("talent_bookings")'), "pipeline must not write talent_bookings");
  assert.ok(
    !/starts_at[\s:]/.test(PIPELINE),
    "pipeline must not stamp a calendar placeholder — that was the bug",
  );
});

test("the pipeline does not reach for the lossy stock shim", () => {
  // `release_offering_stock` frees a QUANTITY newest-first and can release a
  // DIFFERENT allocation than the caller reserved. Capacity labelled it lossy
  // and is waiting on the last caller to delete it.
  assert.ok(
    !PIPELINE.includes("release_offering_stock"),
    "release by allocation ids, never by quantity",
  );
  assert.ok(
    !PIPELINE.includes("reserve_offering_stock"),
    "reserve through the capacity engine, not the old integer decrement",
  );
});
