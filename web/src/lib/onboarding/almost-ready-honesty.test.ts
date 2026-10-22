import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { arrivalFromStamp, draftFixList } from "./arrival";
import { LIVE_CHECK_RETRY_DELAY_MS, verifyLivePageWithRetry } from "./verify-live";

const site = { publicUrl: "https://x.test/w/a", editorUrl: "https://x.test/e", adminPath: "/admin" };
const person = { name: "Ana", city: null };

test("TUL-1839: a failed live check is draft_saved, never ready", () => {
  const a = arrivalFromStamp({ path: "talent", stamp: null, person, businessName: null, services: 1, site: null, talent: { publicUrl: null, todayUrl: "/t", siteUrl: "https://x.test" }, liveCheck: { ok: false, reason: "name_missing" }, published: true });
  assert.equal(a.variant, "draft_saved");
  assert.equal(a.verified, false);
  void site;
});

test("TUL-1839: fix list has one line per failed check with its action", () => {
  assert.deepEqual(draftFixList({ draftReason: "name_missing" }).map((f) => f.action), ["edit_name", "retry"]);
  assert.deepEqual(draftFixList({ draftReason: "network" }).map((f) => f.action), ["check_address", "retry"]);
  assert.equal(draftFixList({ draftReason: undefined }).length > 0, true);
});

test("TUL-1839: address check retries 3 times about 6 s in total", async () => {
  const waits: number[] = [];
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response("", { status: 404 }); }) as typeof fetch;
  const r = await verifyLivePageWithRetry({ url: "https://x.test", name: "Ana", fetchImpl, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(r.ok, false);
  assert.equal(calls, 3);
  assert.equal(waits.reduce((a, b) => a + b, 0), 2 * LIVE_CHECK_RETRY_DELAY_MS);
  assert.ok(LIVE_CHECK_RETRY_DELAY_MS * 2 >= 5000 && LIVE_CHECK_RETRY_DELAY_MS * 2 <= 7000);
});

test("TUL-1839: the failed-check screen never says published; copy en+es has no em dash", () => {
  for (const lang of ["en", "es"]) {
    const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${lang}.json`), "utf8"));
    const arr = m.public.onboarding.arrival;
    assert.doesNotMatch(arr.draftTitlePublished, /published|publicado/i);
    assert.ok(arr.retryPublish && arr.fix.address && arr.fix.nameMissing && arr.fix.retry);
    assert.doesNotMatch(JSON.stringify([arr.draftTitlePublished, arr.draftSubPublished, arr.retryPublish, arr.fix]), /—/);
  }
});

test("TUL-1839: the draft screen renders the fix list and the retry-publish label", () => {
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/arrival-step.tsx"), "utf8");
  assert.match(src, /data-testid="onb-arrival-fixes"/);
  assert.match(src, /arrival\.retryPublish/);
  assert.doesNotMatch(src, /checkAgain/);
});
