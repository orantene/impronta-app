/**
 * TUL-658: Review step. The Publish label reflects publishing only (not the
 * preview/state load), and Undo returns to the site page on a live site.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewPublishButton, reviewUndoDestination } from "./review-flow-state";

test("Publish label says publishing only while publishing, not while the review loads", () => {
  const loading = reviewPublishButton({ loading: true, publishing: false, ready: false, applyBusy: false });
  assert.equal(loading.showPublishing, false);
  assert.equal(loading.disabled, true);
  const publishing = reviewPublishButton({ loading: false, publishing: true, ready: true, applyBusy: false });
  assert.equal(publishing.showPublishing, true);
  assert.equal(publishing.disabled, true);
  const idle = reviewPublishButton({ loading: false, publishing: false, ready: true, applyBusy: false });
  assert.deepEqual(idle, { showPublishing: false, disabled: false });
  assert.equal(reviewPublishButton({ loading: false, publishing: false, ready: true, applyBusy: true }).disabled, true);
});

test("Undo goes back to the site page on a live site, to Theme detail otherwise", () => {
  assert.equal(reviewUndoDestination({ siteLive: true }), "site");
  assert.equal(reviewUndoDestination({ siteLive: false }), "detail");
});

test("ReviewWebsiteScreen wires the publish label to its own transition and Undo to the site page", () => {
  const src = readFileSync(join(process.cwd(), "src/components/talent/site/maison-setup/ReviewWebsiteScreen.tsx"), "utf8");
  assert.match(src, /\[publishing, startPublish\] = useTransition\(\)/);
  assert.doesNotMatch(src, /\{pending\s*\?\s*maisonSetupT\(locale, "Publishing…"\)/);
  assert.match(src, /onUndone/);
  const host = readFileSync(join(process.cwd(), "src/components/talent/site/maison-setup/MaisonSetupHost.tsx"), "utf8");
  assert.match(host, /onUndone=\{/);
});
