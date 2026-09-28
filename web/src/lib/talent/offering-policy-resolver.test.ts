import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLATFORM_POLICY_DEFAULTS,
  resolveOfferingPolicy,
  withEffectivePolicy,
} from "./offering-policy-resolver";
import { whoStepPaymentCopyFor } from "./who-step-payment-copy";

const bare = { reserveMode: "full", depositPct: null, cancellationHours: null } as const;

test("deposit: offering explicit value beats the talent default", () => {
  const p = resolveOfferingPolicy({ ...bare, reserveMode: "deposit", depositPct: 50 }, { depositPct: 30 });
  assert.equal(p.reserveMode, "deposit");
  assert.equal(p.depositPct, 50);
  assert.equal(p.source.depositPct, "offering");
});

test("deposit: null on the offering uses the talent default (what the editor shows)", () => {
  const p = resolveOfferingPolicy(bare, { depositPct: 30 });
  assert.equal(p.reserveMode, "deposit");
  assert.equal(p.depositPct, 30);
  assert.equal(p.source.depositPct, "default");
});

test("deposit: nothing set anywhere stays full, no deposit", () => {
  const p = resolveOfferingPolicy(bare, {});
  assert.equal(p.reserveMode, "full");
  assert.equal(p.depositPct, null);
  assert.equal(p.source.depositPct, "none");
});

test("deposit: an out-of-range default is ignored, like the editor's 'No deposit'", () => {
  for (const bad of [0, 100, -5, "30", null]) {
    const p = resolveOfferingPolicy(bare, { depositPct: bad });
    assert.equal(p.depositPct, null, String(bad));
    assert.equal(p.reserveMode, "full");
  }
});

test("deposit: reserve_mode free is an explicit owner choice and is never overridden", () => {
  const p = resolveOfferingPolicy({ ...bare, reserveMode: "free" }, { depositPct: 30 });
  assert.equal(p.reserveMode, "free");
  assert.equal(p.depositPct, null);
});

test("cancellation: offering, then default, then platform 24 h", () => {
  assert.equal(resolveOfferingPolicy({ ...bare, cancellationHours: 48 }, { cancelHours: 12 }).cancellationHours, 48);
  assert.equal(resolveOfferingPolicy({ ...bare, cancellationHours: 0 }, { cancelHours: 12 }).cancellationHours, 0);
  const d = resolveOfferingPolicy(bare, { cancelHours: 12 });
  assert.equal(d.cancellationHours, 12);
  assert.equal(d.source.cancellationHours, "default");
  const p = resolveOfferingPolicy(bare, {});
  assert.equal(p.cancellationHours, PLATFORM_POLICY_DEFAULTS.cancellationHours);
  assert.equal(p.source.cancellationHours, "platform");
});

test("cancellation: an agency offering (no talent defaults) keeps its own value or stays flexible", () => {
  assert.equal(resolveOfferingPolicy(bare, null).cancellationHours, null);
  assert.equal(resolveOfferingPolicy({ ...bare, cancellationHours: 6 }, null).cancellationHours, 6);
});

test("reschedule: default then platform 24 h", () => {
  assert.equal(resolveOfferingPolicy(bare, { rescheduleHours: 6 }).rescheduleHours, 6);
  assert.equal(resolveOfferingPolicy(bare, {}).rescheduleHours, 24);
});

test("buffers: offering attr, then default, then hours row, then 0 (same chain as slots)", () => {
  const hours = { bufferBeforeMin: 5, bufferAfterMin: 7, minNoticeMin: 90 };
  const attr = resolveOfferingPolicy(
    { ...bare, attributes: { bufferBeforeMin: 20, bufferAfterMin: 25 } },
    { bufferBeforeMin: 10, bufferAfterMin: 15 },
    hours,
  );
  assert.equal(attr.bufferBeforeMin, 20);
  assert.equal(attr.bufferAfterMin, 25);
  const def = resolveOfferingPolicy(bare, { bufferBeforeMin: 10, bufferAfterMin: 15 }, hours);
  assert.equal(def.bufferBeforeMin, 10);
  assert.equal(def.bufferAfterMin, 15);
  const row = resolveOfferingPolicy(bare, {}, hours);
  assert.equal(row.bufferBeforeMin, 5);
  assert.equal(row.bufferAfterMin, 7);
  const none = resolveOfferingPolicy(bare, {}, null);
  assert.equal(none.bufferBeforeMin, 0);
  assert.equal(none.bufferAfterMin, 0);
  // null attr = "use my default", as the editor's attr() reads it.
  const nullAttr = resolveOfferingPolicy({ ...bare, attributes: { bufferAfterMin: null } }, { bufferAfterMin: 15 });
  assert.equal(nullAttr.bufferAfterMin, 15);
});

test("min notice: default wins over the hours row", () => {
  assert.equal(resolveOfferingPolicy(bare, { minNoticeMin: 30 }, { minNoticeMin: 90 }).minNoticeMin, 30);
  assert.equal(resolveOfferingPolicy(bare, {}, { minNoticeMin: 90 }).minNoticeMin, 90);
  assert.equal(resolveOfferingPolicy(bare, {}, null).minNoticeMin, 0);
});

test("withEffectivePolicy + sheet copy state the default deposit checkout charges", () => {
  const o = withEffectivePolicy({ id: "x", ...bare }, { depositPct: 30 });
  assert.equal(o.reserveMode, "deposit");
  assert.equal(o.depositPct, 30);
  const line = whoStepPaymentCopyFor({
    offering: { ...bare },
    sellingDefaults: { depositPct: 30 },
    allowPayInPerson: false,
    locale: "en",
  });
  assert.match(line, /30% deposit/);
});
