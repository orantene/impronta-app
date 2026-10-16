import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { selectedDayScrollLeft, weekScrollLeft } from "./catalog-selected-day-scroll";

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

// TUL-899: only five 64px days fit at 390; the strip must show a full week and page by week.
test("the day strip fits seven days per view and pages a week at a time", () => {
  const css = readFileSync(join(process.cwd(), "src/components/public-booking/catalog-booking-styles.ts"), "utf8");
  assert.match(css, /\.jb-day\{flex:0 0 calc\(\(100% - 36px\) \/ 7\)/);
  assert.match(css, /\.jb-days\{[^}]*gap:6px/);
  assert.equal(weekScrollLeft({ scrollLeft: 0, clientWidth: 350, scrollWidth: 720 }, 1), 350);
  assert.equal(weekScrollLeft({ scrollLeft: 350, clientWidth: 350, scrollWidth: 720 }, 1), 370, "clamped to the end");
  assert.equal(weekScrollLeft({ scrollLeft: 100, clientWidth: 350, scrollWidth: 720 }, -1), 0);
  const picker = readFileSync(join(process.cwd(), "src/components/public-booking/CatalogLiveWhenPicker.tsx"), "utf8");
  assert.equal((picker.match(/<CatalogWeekNav /g) ?? []).length, 2, "live and demo strips both page");
});
