import assert from "node:assert/strict";
import { test } from "node:test";
import { shareInFlight } from "./in-flight";

test("concurrent callers share one run; a later call runs again", async () => {
  let runs = 0;
  let release!: (v: number) => void;
  const run = () => {
    runs++;
    return new Promise<number>((r) => { release = r; });
  };
  const a = shareInFlight("k", run);
  const b = shareInFlight("k", run);
  assert.equal(a, b);
  assert.equal(runs, 1);
  release(7);
  assert.equal(await a, 7);
  const c = shareInFlight("k", async () => { runs++; return 9; });
  assert.equal(await c, 9);
  assert.equal(runs, 2);
});

test("a rejection clears the key so the next call retries", async () => {
  await assert.rejects(shareInFlight("e", async () => { throw new Error("x"); }));
  assert.equal(await shareInFlight("e", async () => 1), 1);
});

test("different keys do not share", async () => {
  const [x, y] = await Promise.all([shareInFlight("a", async () => 1), shareInFlight("b", async () => 2)]);
  assert.deepEqual([x, y], [1, 2]);
});
