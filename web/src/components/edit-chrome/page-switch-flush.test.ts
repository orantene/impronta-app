import assert from "node:assert/strict";
import { test } from "node:test";

import { flushThenNavigate } from "./page-switch-flush";

test("flushes before navigating when the page is dirty", async () => {
  const order: string[] = [];
  let resolveFlush!: () => void;
  const flushPromise = new Promise<void>((resolve) => {
    resolveFlush = resolve;
  });

  const flush = () => {
    order.push("flush:start");
    return flushPromise.then(() => {
      order.push("flush:settle");
    });
  };
  const navigate = () => order.push("navigate");

  const done = flushThenNavigate({ dirty: true, flush, navigate });

  // The flush has begun but navigation must NOT have fired yet — a race here is
  // exactly the VERSION_CONFLICT the workstream removes.
  assert.deepEqual(order, ["flush:start"]);

  resolveFlush();
  await done;

  // Navigation runs only AFTER the awaited flush settles.
  assert.deepEqual(order, ["flush:start", "flush:settle", "navigate"]);
});

test("skips the flush entirely when the page is clean", async () => {
  let flushCalls = 0;
  const navigate = () => {};

  await flushThenNavigate({
    dirty: false,
    flush: () => {
      flushCalls += 1;
      return Promise.resolve();
    },
    navigate,
  });

  assert.equal(flushCalls, 0);
});

test("navigates straight away when no provider flush is available", async () => {
  let navigated = false;
  await flushThenNavigate({
    dirty: true,
    flush: null,
    navigate: () => {
      navigated = true;
    },
  });
  assert.equal(navigated, true);
});

test("still navigates exactly once when the flush rejects", async () => {
  let navCount = 0;
  await flushThenNavigate({
    dirty: true,
    flush: () => Promise.reject(new Error("VERSION_CONFLICT")),
    navigate: () => {
      navCount += 1;
    },
  });
  // A failed flush parks the draft server-side; we never trap the operator.
  assert.equal(navCount, 1);
});

test("resolves true once navigation has been dispatched", async () => {
  const result = await flushThenNavigate({
    dirty: true,
    flush: () => Promise.resolve(),
    navigate: () => {},
  });
  assert.equal(result, true);
});
