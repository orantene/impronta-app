import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { carouselLabels } from "./carousel-labels";

test("TUL-869: Spanish pages get Spanish carousel labels", () => {
  const l = carouselLabels("es-MX");
  assert.equal(l.next, "Siguiente diapositiva");
  assert.equal(l.goTo(2), "Ir a la diapositiva 2");
});

test("English and unknown locales keep English labels", () => {
  assert.equal(carouselLabels("en").goTo(1), "Go to slide 1");
  assert.equal(carouselLabels(undefined).prev, "Previous slide");
});

test("the carousel holds no hard-coded English aria-labels", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/carousel.tsx"), "utf8");
  assert.doesNotMatch(src, /aria-label="(Previous slide|Next slide|Highlights|Reviews)"/);
  assert.doesNotMatch(src, /Go to slide/);
});
