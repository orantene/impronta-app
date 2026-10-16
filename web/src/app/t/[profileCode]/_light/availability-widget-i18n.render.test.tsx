import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AvailabilityWidget } from "./AvailabilityWidget";

const widget = (locale: string, nextAvailableDate: string | null = null, days: number | null = 30) =>
  renderToStaticMarkup(
    createElement(AvailabilityWidget, {
      availableDaysInNext30: days,
      availabilityDots14d: "··××··××··××··",
      nextAvailableDate,
      locale,
    }),
  );

// TUL-683: the pill, the 14-day caption and the strip label followed English only.
test("ES availability widget is Spanish, no English left", () => {
  const html = widget("es");
  assert.match(html, /Disponible/);
  assert.match(html, /de los próximos 30 días/);
  assert.match(html, /14 días/);
  assert.doesNotMatch(html, /Available|of next 30 days|14 days|14-day/);
});

test("EN availability widget keeps the English copy", () => {
  const html = widget("en");
  assert.match(html, /Available/);
  assert.match(html, /of next 30 days/);
  assert.match(html, /14 days/);
});

test("ES next-available date uses the Spanish month", () => {
  const html = widget("es", "2026-10-20T12:00:00Z", 0);
  assert.match(html, /Próxima disponibilidad/);
  assert.match(html, /oct/i);
  assert.doesNotMatch(html, /Next available|Oct 20/);
});
