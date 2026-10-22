import assert from "node:assert/strict";
import { test } from "node:test";

import { createStepHistory, stepHistoryState, stepOfHistoryState } from "./step-history";

/** A fake browser: entries, an index, async Back (popstate), and a Next-like router that only knows the URLs it was told about. */
function fakeBrowser(startUrl: string) {
  const entries: Array<{ url: string; state: unknown }> = [{ url: startUrl, state: { __NA: true } }];
  let idx = 0;
  let step: string | null = "choose";
  const gotos: string[] = [];
  let history!: ReturnType<typeof createStepHistory>;
  const pending: Array<() => void> = [];
  const b = {
    entries,
    get idx() { return idx; },
    get url() { return entries[idx].url; },
    show(s: string | null) { step = s; history.sync(); },
    get step() { return step; },
    gotos,
    settle() { while (pending.length) pending.shift()!(); },
    userBack() { const i = idx - 1; assert.ok(i >= 0); idx = i; history.onPop(entries[idx].state); },
  };
  history = createStepHistory({
    currentStep: () => step,
    href: () => entries[idx].url,
    pushState: (state, url) => { entries.splice(idx + 1); entries.push({ url: `https://x.test${url.replace("https://x.test", "")}`, state: { ...state, __NA: true } }); idx += 1; },
    replaceState: (state, url) => { entries[idx] = { url, state: { ...state, __NA: true } }; },
    back: () => { pending.push(() => { idx -= 1; history.onPop(entries[idx].state); }); },
    goto: (s) => { gotos.push(s); step = s; },
  });
  return Object.assign(b, { history });
}

const stepOf = (url: string) => new URL(url).searchParams.get("step");

test("TUL-812: history entries carry the step, and only ours (never Next's __NA)", () => {
  assert.deepEqual(stepHistoryState("save"), { tlStep: "save" });
  assert.deepEqual(stepHistoryState(null), {});
  assert.equal(stepOfHistoryState({ tlStep: "save", __NA: true }), "save");
  assert.equal(stepOfHistoryState({ tlStep: "<x>" }), null);
  assert.equal(stepOfHistoryState(null), null);
});

const FORWARD = ["entry", "reading", "understood", "essentials", "setup", "readyToBuild", "save"];

test("TUL-812: the URL always names the visible step going forward", () => {
  const b = fakeBrowser("https://x.test/start?choice=myself");
  b.history.sync();
  for (const s of FORWARD) {
    b.show(s);
    assert.equal(stepOf(b.url), s, `url after ${s}`);
  }
});

test("TUL-812: in-app Back from the email step shows the review step and the URL agrees", () => {
  const b = fakeBrowser("https://x.test/start?choice=myself");
  b.history.sync();
  for (const s of FORWARD) b.show(s);
  b.show("readyToBuild"); // the in-app Back button changed the step
  b.settle(); // the history entry pops
  assert.equal(b.step, "readyToBuild");
  assert.equal(stepOf(b.url), "readyToBuild");
  assert.deepEqual(b.gotos, [], "the wizard never jumped anywhere else");
});

test("TUL-812: browser Back from the email step lands on the review step, not the first screen", () => {
  const b = fakeBrowser("https://x.test/start?choice=myself");
  b.history.sync();
  for (const s of FORWARD) b.show(s);
  b.userBack();
  assert.equal(b.step, "readyToBuild");
  assert.equal(stepOf(b.url), "readyToBuild");
  b.userBack();
  assert.equal(b.step, "setup");
  assert.equal(stepOf(b.url), "setup");
});

test("TUL-812: Back decides by the entry's own step even when its URL lost the ?step= (stale router rewrite)", () => {
  const b = fakeBrowser("https://x.test/start?choice=myself");
  b.history.sync();
  for (const s of FORWARD) b.show(s);
  // what Next's HistoryUpdater used to do: rewrite an entry's URL to its stale canonical URL
  b.entries[b.idx - 1] = { url: "https://x.test/start?choice=myself", state: b.entries[b.idx - 1].state };
  b.userBack();
  assert.equal(b.step, "readyToBuild");
});

test("TUL-812: a reload on a step keeps the URL while the resume lookup runs, then follows the screen", () => {
  const b = fakeBrowser("https://x.test/start?step=save");
  b.show("loading");
  assert.equal(stepOf(b.url), "save", "nothing rewrote the deep link yet");
  b.show("resume");
  assert.equal(stepOf(b.url), "resume");
  b.show("save"); // Continue
  assert.equal(stepOf(b.url), "save");
  b.show("readyToBuild"); // in-app Back
  assert.equal(stepOf(b.url), "readyToBuild");
});

test("TUL-812: browser Back to a later or locked screen leaves the URL on the visible step", () => {
  const b = fakeBrowser("https://x.test/start");
  b.history.sync();
  b.show("entry");
  b.show("understood");
  b.show("essentials");
  b.userBack(); // essentials -> understood is allowed
  assert.equal(b.step, "understood");
  b.show("building");
  b.entries[b.idx] = { url: "https://x.test/start?step=entry", state: stepHistoryState("entry") };
  b.history.onPop(b.entries[b.idx].state);
  assert.equal(b.step, "building", "a build in flight is never left");
  assert.equal(stepOf(b.url), "building");
});
