import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { test } from "node:test";
import { CONVERSION_EVENTS } from "./conversion-events";

/**
 * A defined event that nothing emits is worse than no event at all.
 *
 * `product-events.ts` declares 65 event names. When this guard was written,
 * 43 of them were emitted nowhere in the codebase. That is not a gap you can
 * see by reading: anyone opening that file finds a rich, confident schema and
 * reasonably concludes the funnel is measured. It is not. Dashboards built on
 * those names return zero forever and look like a product problem.
 *
 * Two rules, both about keeping measurement honest.
 */

/**
 * Detecting a real emission is harder than it looks, and getting it wrong in
 * either direction is why this file carries so much comment.
 *
 * Events are referenced TWO ways in this codebase: as a quoted literal
 * (`trackProductEvent("start_inquiry")`) and through the constant
 * (`trackProductEvent(PRODUCT_ANALYTICS_EVENTS.start_inquiry)`), the latter in
 * more than fifty places. Searching only for the quoted form reports most of
 * the healthy events as dead. Searching for the bare token instead matches
 * prose in comments and reports dead ones as healthy.
 *
 * So: match either reference form, and require the line to actually be a call
 * or an assignment. A mention in a comment is not instrumentation.
 */
function emittedSomewhere(token: string): boolean {
  try {
    const out = execSync(
      `grep -rh -e '"${token}"' -e 'PRODUCT_ANALYTICS_EVENTS\.${token}' -e '${token}(' ` +
        `src --include='*.ts' --include='*.tsx' ` +
        `| grep -v 'product-events' ` +
        `| grep -E 'trackProductEvent|name:|logAnalyticsEventServer|${token}\\('`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/**
 * Conversion events are sent through the typed helpers, so the event STRING
 * never appears at a call site. Checking for the string here would fail on
 * correctly wired code, which is how a guard teaches people to disable it.
 * What matters is that each helper is called from real product code.
 */
const HELPER_FOR_EVENT: Record<string, string> = {
  [CONVERSION_EVENTS.signup_completed]: "trackSignupCompleted",
  [CONVERSION_EVENTS.workspace_activated]: "trackWorkspaceActivated",
  [CONVERSION_EVENTS.plan_upgraded]: "trackPlanChanged",
  [CONVERSION_EVENTS.plan_downgraded]: "trackPlanChanged",
};

test("every conversion event has a helper that real code calls", () => {
  const dead = Object.values(CONVERSION_EVENTS).filter(
    (name) => !emittedSomewhere(HELPER_FOR_EVENT[name]!),
  );
  assert.deepEqual(
    dead,
    [],
    `These conversion events are defined but nothing calls their helper, so ` +
      `any funnel built on them reports zero forever:\n` +
      dead.map((d) => `  ${d} (needs ${HELPER_FOR_EVENT[d]})`).join("\n"),
  );
});

test("every conversion event is mapped to a helper", () => {
  const unmapped = Object.values(CONVERSION_EVENTS).filter((n) => !HELPER_FOR_EVENT[n]);
  assert.deepEqual(unmapped, [], "Add the new event to HELPER_FOR_EVENT so it stays guarded.");
});

/**
 * A ratchet, not a cleanup demand. The dead names in `product-events.ts` are
 * pre-existing and some are deliberate placeholders; this test does not force
 * anyone to fix them. It pins the number so the next person cannot quietly
 * add one more.
 *
 * Two that matter to marketing and are worth fixing early: `experiment_view`
 * and `experiment_convert` are defined but never fire, which means the A/B
 * framework is a shell, and the whole `/get-started` step instrumentation is
 * defined with a comment about finding where visitors drop off while not
 * actually recording where visitors drop off.
 */
const KNOWN_DEAD_PRODUCT_EVENTS = 25;

test("the count of never-emitted product events does not grow", () => {
  const names = execSync(
    `grep -oE '^  [a-z_]+:' src/lib/analytics/product-events.ts | tr -d ' :'`,
    { encoding: "utf8" },
  )
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const dead = names.filter((n) => !emittedSomewhere(n));

  assert.ok(
    dead.length <= KNOWN_DEAD_PRODUCT_EVENTS,
    `Never-emitted product events went from ${KNOWN_DEAD_PRODUCT_EVENTS} to ` +
      `${dead.length}. Defining an event without sending it builds a dashboard ` +
      `that reads zero forever. Emit it, or do not define it yet.\n` +
      dead.join(", "),
  );

  // Ratchet DOWN as they get fixed, so the allowance can never drift upward.
  assert.ok(
    dead.length >= KNOWN_DEAD_PRODUCT_EVENTS - 5,
    `Good news: dead events dropped to ${dead.length}. Lower ` +
      `KNOWN_DEAD_PRODUCT_EVENTS to ${dead.length} so the ratchet keeps its teeth.`,
  );
});
