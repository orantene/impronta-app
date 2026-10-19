/**
 * TUL-924: the booking sheet's label icons are decorative. They never change a label's text,
 * are hidden from assistive tech, and the address/access-note labels share the field-label style.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CatalogCalendarIcon, CatalogClockIcon, CatalogPinIcon } from "./catalog-field-icons";
import { CatalogWhoSummary } from "./catalog-who-summary";
import { CATALOG_BOOKING_CSS } from "./catalog-booking-styles";
import { ServiceAddressField } from "./ServiceAddressField";

const noop = () => {};

test("each icon is an svg hidden from assistive tech", () => {
  for (const Icon of [CatalogCalendarIcon, CatalogClockIcon, CatalogPinIcon]) {
    const html = renderToStaticMarkup(<Icon />);
    assert.match(html, /^<svg /);
    assert.match(html, /aria-hidden="true"/);
  }
});

test("the summary Fecha and Hora rows carry a calendar and a clock icon, text unchanged", () => {
  const html = renderToStaticMarkup(
    <CatalogWhoSummary es service="Corte" day={new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)} time="10:00" tz={null} total="$500" />,
  );
  const rows = [...html.matchAll(/<span style="[^"]*">(<svg[\s\S]*?<\/svg>)([^<]+)<\/span>/g)];
  assert.deepEqual(rows.map((m) => m[2]), ["Fecha", "Hora"]);
  assert.equal(rows.length, 2);
});

test("the service address label carries a map pin and keeps its text and `for` binding", () => {
  const html = renderToStaticMarkup(<ServiceAddressField value="" note="" onChange={noop} locale="es" />);
  assert.match(html, /<label for="[^"]+"><svg[\s\S]*?<\/svg>Dirección del servicio<\/label>/);
});

test("address and access-note labels share the field-label style with the other fields", () => {
  assert.match(CATALOG_BOOKING_CSS, /\.jb-field span,\.jb-field>label\{font-size:\.875rem;font-weight:600/);
});

test("TUL-1022: the summary Hora row never dangles a zone label without a time", () => {
  const day = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
  const none = renderToStaticMarkup(<CatalogWhoSummary es service="Corte" day={day} time={null} tz="America/Cancun" total="$500" />);
  assert.doesNotMatch(none, /· Hora de/);
  const withTime = renderToStaticMarkup(<CatalogWhoSummary es service="Corte" day={day} time="10:00" tz="America/Cancun" total="$500" />);
  assert.match(withTime, /10:00 · Hora de Cancún/);
});
