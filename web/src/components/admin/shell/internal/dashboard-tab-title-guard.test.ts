/**
 * TUL-1274: an RSC refresh re-applies the layout's generic <title>, and the
 * bridge only re-asserted when its deps changed, so the tab stayed on
 * "Tulala · Vende lo que haces…" instead of "Ajustes · Tulala".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  shouldReassertTitle,
  TITLE_REASSERT_BUDGET,
  watchDocumentTitle,
  type TitleObserverFactory,
  type TitleScheduler,
} from "./dashboard-tab-title-guard";

/** Manual macrotask queue: nothing runs until the test flushes it. */
function manualScheduler() {
  const queue: Array<() => void> = [];
  const schedule: TitleScheduler = (run) => {
    queue.push(run);
    return () => {
      const i = queue.indexOf(run);
      if (i >= 0) queue.splice(i, 1);
    };
  };
  const flush = () => {
    while (queue.length) queue.shift()!();
  };
  return { schedule, flush, queue };
}

function fakeObserverFactory() {
  const observers: Array<{ cb: () => void; target: unknown; options: unknown; connected: boolean }> = [];
  const factory: TitleObserverFactory = (cb) => {
    const entry = { cb, target: null as unknown, options: null as unknown, connected: false };
    observers.push(entry);
    return {
      observe(target, options) {
        entry.target = target;
        entry.options = options;
        entry.connected = true;
      },
      disconnect() {
        entry.connected = false;
      },
    };
  };
  return { factory, observers };
}

test("shouldReassertTitle: only when the title drifted from a non-empty wanted title", () => {
  assert.equal(shouldReassertTitle("Tulala · Vende lo que haces", "Ajustes · Tulala"), true);
  assert.equal(shouldReassertTitle("Ajustes · Tulala", "Ajustes · Tulala"), false);
  assert.equal(shouldReassertTitle("anything", ""), false);
});

test("watchDocumentTitle: sets the title and re-asserts it after a metadata reset", () => {
  const head = {};
  const doc = { title: "Tulala · Vende lo que haces", head };
  const { factory, observers } = fakeObserverFactory();
  const sched = manualScheduler();
  const stop = watchDocumentTitle(doc, "Ajustes · Tulala", factory, sched.schedule);
  assert.equal(doc.title, "Ajustes · Tulala");
  assert.equal(observers.length, 1);
  assert.equal(observers[0].target, head);
  assert.deepEqual(observers[0].options, { childList: true, subtree: true, characterData: true });

  // RSC refresh: Next writes the layout's generic title back.
  doc.title = "Tulala · Vende lo que haces";
  observers[0].cb();
  observers[0].cb();
  assert.equal(doc.title, "Tulala · Vende lo que haces", "never written inside the observer callback");
  assert.equal(sched.queue.length, 1, "bursts coalesce into one pending re-assert");
  sched.flush();
  assert.equal(doc.title, "Ajustes · Tulala");

  // Our own write fires the observer again: no change.
  observers[0].cb();
  sched.flush();
  assert.equal(doc.title, "Ajustes · Tulala");

  stop();
  assert.equal(observers[0].connected, false);
  doc.title = "Tulala";
  observers[0].cb();
  sched.flush();
  assert.equal(doc.title, "Tulala", "after cleanup the guard never writes");
});

test("watchDocumentTitle: a title the browser never reports back cannot spin (budget, then stop)", () => {
  // A document whose getter never equals what was set (normalization, or a
  // second writer resetting it on every mutation): the old guard would loop.
  let writes = 0;
  const doc = {
    head: {},
    get title() {
      return "something else";
    },
    set title(_v: string) {
      writes += 1;
    },
  };
  const { factory, observers } = fakeObserverFactory();
  const sched = manualScheduler();
  watchDocumentTitle(doc, "Hoy · Tulala", factory, sched.schedule);
  for (let i = 0; i < TITLE_REASSERT_BUDGET * 5; i += 1) {
    observers[0].cb();
    sched.flush();
  }
  assert.equal(writes, 1 + TITLE_REASSERT_BUDGET, "initial write plus the budget, never more");
  assert.equal(observers[0].connected, false, "the guard disconnects once the budget is spent");
});

test("watchDocumentTitle: no MutationObserver (old runtime) still sets the title once", () => {
  const doc = { title: "x", head: {} };
  const stop = watchDocumentTitle(doc, "Perfil · Tulala", null);
  assert.equal(doc.title, "Perfil · Tulala");
  stop();
});
