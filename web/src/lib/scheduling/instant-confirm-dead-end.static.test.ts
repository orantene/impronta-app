/**
 * D-100, the client half. "Confirm this time" must never leave the customer on
 * an unchanged page with nothing to read.
 *
 * `BookableComposer.confirmInstant` had two exits that rendered nothing:
 *
 *   1. `if (!slot || !tenantId || !active.talentProfileId) return;` — a service
 *      with no talent attached swallowed the click entirely. The equivalent
 *      guard in `OfferingInstantMount` already sets a sentence, so this one was
 *      the outlier, not the pattern.
 *   2. no `catch` around the server action — a rejected action (network drop, a
 *      500 on the action route) rejected a floating promise, `finally` cleared
 *      `busy`, and the button went back to reading "Confirm this time" as if
 *      nothing had been pressed.
 *
 * Lives under lib/scheduling because that is the directory `test:scheduling`
 * globs; `guest-instant-captcha.static.test.ts` reads the same component from
 * here for the same reason.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const COMPOSER = join(
  process.cwd(),
  "src/components/public-booking/BookableComposer.tsx",
);

test("the confirm handler never swallows a click without saying why", () => {
  const src = readFileSync(COMPOSER, "utf8");
  assert.doesNotMatch(
    src,
    /if \(!slot \|\| !tenantId \|\| !active\.talentProfileId\) return;/,
    "a bare guard return is a dead end: the customer must be told what is missing",
  );
  assert.match(
    src,
    /public\.slotPicker\.notBookableOnline/,
    "the missing-talent refusal must be a sentence the customer can read",
  );
});

test("a rejected confirm renders a sentence instead of nothing", () => {
  const src = readFileSync(COMPOSER, "utf8");
  assert.match(
    src,
    /\}\s*catch\s*\{[\s\S]{0,400}?setError\(/,
    "confirmInstant must catch a rejected server action and surface it",
  );
  assert.match(
    src,
    /public\.slotPicker\.confirmFailed/,
    "the failure copy must come from the message catalog, not a bare string",
  );
});

/**
 * The nesting tripwire. `test:scheduling` cannot render React, so the
 * load-bearing proof for this lives in
 * `test/components/public-booking/bookable-composer-refusal.test.tsx`, which
 * clicks Confirm and looks for the sentence on screen. This is the cheap
 * lane-local guard that catches the paragraph being moved back inside the
 * block, which is how the refusal became invisible in the first place.
 */
test("the refusal paragraph renders outside the instant block, not inside it", () => {
  const src = readFileSync(COMPOSER, "utf8");
  const errorParagraph = src.indexOf('{error ? (');
  const instantBlock = src.indexOf('{instant && slot ? (');
  assert.notEqual(errorParagraph, -1, "the refusal paragraph must exist");
  assert.notEqual(instantBlock, -1, "the instant block must exist");
  assert.ok(
    errorParagraph < instantBlock,
    "nesting the refusal inside `instant && slot` hides it: `slotTaken` clears `slot` " +
      "and `upgrade` clears `instant`, both in the same update that sets the refusal",
  );
});
