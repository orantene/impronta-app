import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPublicSlots } from "./slot-picker-load";

const json = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("TUL-977: a hung slots request resolves at the deadline instead of loading forever", async () => {
  let aborted = false;
  const hung = ((_url: string, init?: RequestInit) =>
    new Promise<Response>(() => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
    })) as unknown as typeof fetch;
  const started = Date.now();
  const r = await loadPublicSlots("/x", { fetchImpl: hung, deadlineMs: 30 });
  assert.deepEqual(r, { ok: false });
  assert.ok(Date.now() - started < 1000);
  assert.equal(aborted, true);
});

test("TUL-977: an empty answer carries its reason through", async () => {
  const r = await loadPublicSlots("/x", { fetchImpl: json(200, { slots: [], reason: "no_booking_hours", timezone: "America/Cancun" }) });
  assert.deepEqual(r, { ok: true, slots: [], timezone: "America/Cancun", reason: "no_booking_hours" });
});

test("TUL-977: a failed answer is not a list", async () => {
  assert.deepEqual(await loadPublicSlots("/x", { fetchImpl: json(500, { error: "x" }) }), { ok: false });
});

test("TUL-977: the picker shows a skeleton, not a loading sentence", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "SlotPicker.tsx"), "utf8");
  assert.match(src, /data-testid="slot-picker-skeleton"/);
  assert.match(src, /loadPublicSlots/);
  assert.match(src, /aria-busy/);
});
