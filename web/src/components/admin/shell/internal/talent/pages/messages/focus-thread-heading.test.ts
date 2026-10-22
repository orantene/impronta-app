import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const DIR = "src/components/admin/shell/internal/talent/pages/messages";
const HELPER = readFileSync(join(process.cwd(), DIR, "focus-thread-heading.ts"), "utf8");
const PAGE = readFileSync(join(process.cwd(), DIR, "MessagesPage.tsx"), "utf8");
const PIN = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/_pin-then-redirect.tsx"), "utf8");

describe("TUL-1170 bell deep link focuses the thread, not the whole panel", () => {
  it("watches for the thread and focuses it once", () => {
    assert.match(HELPER, /MutationObserver/);
    assert.match(HELPER, /section\[data-thread\]:not\(\[data-thread="none"\]\)/);
    assert.match(HELPER, /heading\.focus\(\{ preventScroll: true \}\)/);
    assert.match(HELPER, /dispatchEvent\(new Event\(THREAD_OPENED_EVENT\)\)/);
  });
  it("MessagesPage hands the region to the helper and returns its cleanup", () => {
    assert.match(PAGE, /return focusThreadHeadingWhenReady\(regionRef\.current\)/);
  });
  it("the opening status clears when the thread is open, not only on the timer", () => {
    assert.match(PIN, /addEventListener\(THREAD_OPENED_EVENT, clear\)/);
    assert.match(PIN, /removeEventListener\(THREAD_OPENED_EVENT, clear\)/);
  });
});
