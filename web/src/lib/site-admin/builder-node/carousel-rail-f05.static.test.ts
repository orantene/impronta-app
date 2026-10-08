/**
 * F-05 — rail carousel must honor autoplay / loop / reduced-motion props
 * (hero already did; rail previously only emitted inert data-attrs).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/site-admin/builder-node/carousel.tsx"),
  "utf8",
);
const RENDER = readFileSync(
  join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
  "utf8",
);

test("RailCarousel reads autoplayMs, loop, and prefers-reduced-motion", () => {
  // The rail branch must consume the same levers as hero, not ignore them.
  assert.match(SRC, /function RailCarousel\(/);
  assert.match(SRC, /autoplayMs/);
  assert.match(SRC, /prefers-reduced-motion: reduce/);
  assert.match(SRC, /useCarouselEditing/);
  // Autoplay interval is gated on editing + reduced + paused.
  assert.match(SRC, /if \(editing \|\| reduced \|\| paused \|\| !autoplayMs \|\| count <= 1\) return/);
});

test("rail render path passes autoplayMs and loop into the track", () => {
  // Ensure we did not leave only data-attrs without props on the client track.
  assert.match(
    RENDER,
    /variant=\"rail\"[\s\S]{0,240}autoplayMs=\{node\.props\.autoplayMs\}[\s\S]{0,120}loop=\{node\.props\.loop\}/,
  );
});
