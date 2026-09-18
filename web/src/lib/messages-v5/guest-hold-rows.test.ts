import assert from "node:assert/strict";
import { test } from "node:test";

import { decorateHoldChips, readHoldFromTable, readHoldFromTimes, shelfHoldLabel } from "./guest-hold-rows";

const now = new Date("2026-09-17T10:00:00.000Z");
const labels = { minutesLeft: "{minutes} min left", ended: "Hold ended" };

test("shelfHoldLabel: live minutes, ended, no expiry", () => {
  assert.equal(shelfHoldLabel("2026-09-17T10:12:00.000Z", now, labels), "12 min left");
  assert.equal(shelfHoldLabel("2026-09-17T09:59:00.000Z", now, labels), "Hold ended");
  assert.equal(shelfHoldLabel(null, now, labels), null);
  assert.equal(shelfHoldLabel(undefined, now, labels), null);
});

test("readHoldFromTimes: picked slot carries expiry; unpicked is ignored", () => {
  assert.equal(readHoldFromTimes({ slots: [{ startsAt: "2026-09-20T15:00:00.000Z" }] }), null);
  const picked = readHoldFromTimes({
    slots: [{ startsAt: "2026-09-20T15:00:00.000Z" }],
    pickedStartsAt: "2026-09-20T15:00:00.000Z",
    holdExpiresAt: "2026-09-17T10:15:00.000Z",
    holdId: "h1",
  });
  assert.deepEqual(picked, {
    kind: "appointment",
    recordId: "h1",
    label: "2026-09-20T15:00:00.000Z",
    holdExpiresAt: "2026-09-17T10:15:00.000Z",
    recordDate: "2026-09-20T15:00:00.000Z",
  });
});

test("readHoldFromTable: picked table shows the label and never invents a hold", () => {
  assert.equal(readHoldFromTable({ offeringIds: ["s"], labels: ["Cut"] }), null);
  const table = readHoldFromTable({
    variant: "table",
    tables: [{ label: "T4", partySize: 4, startsAt: "2026-09-20T19:30:00.000Z" }],
  });
  assert.equal(table?.label, "T4");
  assert.equal(table?.holdExpiresAt, null);
  const held = readHoldFromTable({
    variant: "table",
    tables: [{ label: "T4", partySize: 4, startsAt: "2026-09-20T19:30:00.000Z" }],
    holdExpiresAt: "2026-09-17T10:15:00.000Z",
  });
  assert.equal(held?.holdExpiresAt, "2026-09-17T10:15:00.000Z");
});

test("decorateHoldChips: overlays a hold chip; synthesizes a row when no record exists", () => {
  const items = {
    currency: "USD",
    lines: [],
    records: [
      {
        kind: "appointment",
        recordId: "ap-1",
        paymentState: null,
        fulfilmentState: "hold",
        recordDate: null,
      },
    ],
  };
  const decorated = decorateHoldChips(items, [
    {
      kind: "professional_times",
      payload: {
        pickedStartsAt: "2026-09-20T15:00:00.000Z",
        holdExpiresAt: "2026-09-17T10:15:00.000Z",
      },
    },
  ]);
  assert.equal(decorated?.records.length, 1);
  assert.equal(decorated?.records[0]?.holdExpiresAt, "2026-09-17T10:15:00.000Z");
  assert.equal(decorated?.records[0]?.label, "2026-09-20T15:00:00.000Z");

  const synthesized = decorateHoldChips(null, [
    {
      kind: "service_card",
      payload: { variant: "table", tables: [{ label: "T4", partySize: 2, startsAt: "2026-09-20T19:30:00.000Z" }] },
    },
  ]);
  assert.equal(synthesized?.records.length, 1);
  assert.equal(synthesized?.records[0]?.kind, "reservation");
  assert.equal(synthesized?.records[0]?.label, "T4");
  assert.equal(synthesized?.records[0]?.holdExpiresAt, null);
  assert.equal(synthesized?.records[0]?.fulfilmentState, null);
});
