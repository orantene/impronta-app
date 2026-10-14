import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as copy from "./support-copy";

// TUL-617: the CTA's open event is lost when the launcher (streamed, async
// server mount) has not attached its listener yet. The request must be
// remembered and consumed by the launcher when it mounts.
function fakeWindow() {
  const t = new EventTarget();
  return Object.assign(t, {}) as unknown as Window & typeof globalThis;
}

test("an open request with no listener yet is remembered and consumed once", () => {
  const w = fakeWindow();
  (globalThis as unknown as { window: unknown }).window = w;
  try {
    copy.openMarketingSupport("t-1");
    const consume = (copy as unknown as { consumePendingSupportOpen?: () => { ticketId?: string } | null })
      .consumePendingSupportOpen;
    assert.equal(typeof consume, "function", "consumePendingSupportOpen must exist");
    assert.deepEqual(consume!(), { ticketId: "t-1" });
    assert.equal(consume!(), null);
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

test("hero CTA uses the pending-aware opener and the launcher consumes it on mount", () => {
  const dir = new URL("../../components/marketing/support/", import.meta.url);
  const hero = readFileSync(new URL("SupportStartHere.tsx", dir), "utf8");
  const launcher = readFileSync(new URL("MarketingSupportLauncher.tsx", dir), "utf8");
  assert.ok(hero.includes("openMarketingSupport()"));
  assert.ok(!hero.includes("dispatchEvent"));
  assert.ok(launcher.includes("consumePendingSupportOpen()"));
});
