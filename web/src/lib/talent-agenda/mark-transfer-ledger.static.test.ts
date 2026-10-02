import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("markBookingTransferReceived ledger path (Track D3)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "booking-actions.ts"), "utf8");

  it("routes transfer confirm through recordBookingPayment", () => {
    const start = src.indexOf("export async function markBookingTransferReceived");
    assert.ok(start >= 0);
    const body = src.slice(start, start + 2200);
    assert.match(body, /recordBookingPayment\(/);
    assert.match(body, /method:\s*"transfer"/);
    assert.match(body, /agenda-transfer-received/);
  });
});
