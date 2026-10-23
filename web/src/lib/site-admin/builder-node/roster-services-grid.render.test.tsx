/** TUL-1372: the roster grid renders the Service and Who filters, ES/EN, request links only. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RosterServicesGrid } from "./roster-services-grid";

const entries = [
  { id: "r0", title: "Chef for dinners", who: "Rafa Chef", price: "From $1,500 MXN", href: "/contact?message=a", cta: "request" as const },
  { id: "r1", title: "Waiter service", who: "Our team", price: "$800 MXN", href: "/contact?message=b", cta: "request" as const },
];

test("EN: heading, both filters, a Request link per card, no button or checkout", () => {
  const html = renderToStaticMarkup(<RosterServicesGrid entries={entries} locale="en" />);
  assert.match(html, /From our team/);
  assert.match(html, /data-roster-filter="service"/);
  assert.match(html, /data-roster-filter="who"/);
  assert.equal((html.match(/data-roster-card/g) ?? []).length, 2);
  assert.equal((html.match(/>Request<\/a>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<button|checkout|pay/i);
});

test("ES labels", () => {
  const html = renderToStaticMarkup(<RosterServicesGrid entries={entries} locale="es" />);
  for (const word of ["De nuestro equipo", "Servicio", "Quién", "Todos", "Solicitar"]) assert.ok(html.includes(word), word);
});

test("a single service and a single person show no filters; no entries render nothing", () => {
  const html = renderToStaticMarkup(<RosterServicesGrid entries={[entries[0]!]} locale="en" />);
  assert.doesNotMatch(html, /data-roster-filters/);
  assert.equal(renderToStaticMarkup(<RosterServicesGrid entries={[]} locale="en" />), "");
});

test("TUL-1471b: an instant entry shows Book / Reservar and links to the widget; request entries keep Request", () => {
  const mixed = [...entries, { id: "r2", title: "Photo session", who: "Valeria Costa", price: "$800 MXN", href: "/book?service=abc", cta: "book" as const }];
  const en = renderToStaticMarkup(<RosterServicesGrid entries={mixed} locale="en" />);
  assert.match(en, /href="\/book\?service=abc"[^>]*>Book<\/a>/);
  assert.equal((en.match(/>Request<\/a>/g) ?? []).length, 2);
  const es = renderToStaticMarkup(<RosterServicesGrid entries={mixed} locale="es" />);
  assert.match(es, /href="\/book\?service=abc"[^>]*>Reservar<\/a>/);
});
