/**
 * T9.3 — chips have text; colour is never the only signal; countdown is labelled.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRIM = path.join(ROOT, "../../components/admin/shell/internal/talent/agenda/primitives");

describe("T9.3 agenda a11y contracts", () => {
  it("PaymentStateChip exposes aria-label text (not colour alone)", () => {
    const src = readFileSync(path.join(PRIM, "PaymentStateChip.tsx"), "utf8");
    assert.match(src, /aria-label=\{meta\.label\}/);
    assert.match(src, /meta\.label/);
  });

  it("CountdownText exposes aria-label for screen readers", () => {
    const src = readFileSync(path.join(PRIM, "CountdownText.tsx"), "utf8");
    assert.match(src, /aria-label=/);
    // Must not live-announce every tick via assertive live region.
    assert.doesNotMatch(src, /aria-live=["']assertive["']/);
  });
});
