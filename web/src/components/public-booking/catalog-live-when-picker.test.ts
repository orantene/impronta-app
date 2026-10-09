import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { selectedDayScrollLeft } from "./catalog-selected-day-scroll";

function fakeEl(opts: {
  left: number;
  width: number;
  scrollLeft?: number;
  clientWidth?: number;
}): HTMLElement {
  const width = opts.width;
  const left = opts.left;
  return {
    offsetWidth: width,
    clientWidth: opts.clientWidth ?? width,
    scrollLeft: opts.scrollLeft ?? 0,
    getBoundingClientRect: () =>
      ({
        left,
        width,
        right: left + width,
        top: 0,
        bottom: 40,
        height: 40,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  } as unknown as HTMLElement;
}

// Catches: date strip scroll used offsetLeft vs an ancestor and left the
// selected day off-screen after a swipe.
test("selected day scroll centers relative to the strip, not an ancestor", () => {
  const strip = fakeEl({ left: 100, width: 200, clientWidth: 200, scrollLeft: 40 });
  const day = fakeEl({ left: 100 + 180, width: 64 });
  // Day is 180px into the strip's visible/content coords; center in 200px viewport:
  // scrollLeft + 180 - (200 - 64) / 2 = 40 + 180 - 68 = 152
  assert.equal(selectedDayScrollLeft(strip, day), 152);
});

// Catches: "Empezar de nuevo← Cambiar…" jammed as one inline line.
test("booking back links are block-level so Start over and Cambiar stack", () => {
  const css = readFileSync(join(process.cwd(), "src/components/public-booking/catalog-booking-styles.ts"), "utf8");
  assert.match(css, /\.jb-back-link\{[^}]*display:block/);
});
