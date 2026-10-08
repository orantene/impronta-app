import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ServiceAddressField } from "./ServiceAddressField";

const noop = () => {};

test("renders visible labels bound to inputs, privacy line, street-address autocomplete (es default)", () => {
  const html = renderToStaticMarkup(
    <ServiceAddressField value="" note="" onChange={noop} locale="es" />,
  );
  assert.match(html, /Dirección del servicio/);
  assert.match(html, /Nota de acceso \(opcional\)/);
  assert.match(html, /Solo tu profesional ve esta dirección/);
  assert.match(html, /autoComplete="street-address"|autocomplete="street-address"/);
  const labelFors = [...html.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(labelFors.length, 2);
  for (const id of labelFors) assert.match(html, new RegExp(`<input id="${id.replace(/[:]/g, "\\$&")}"`));
  assert.ok(!html.includes("role=\"alert\""), "no error without an error code");
  assert.ok(!html.includes("aria-invalid"));
});

test("english copy", () => {
  const html = renderToStaticMarkup(
    <ServiceAddressField value="" note="" onChange={noop} locale="en" />,
  );
  assert.match(html, /Service address/);
  assert.match(html, /Only your provider sees this address/);
});

test("address error is announced and described by the input", () => {
  const html = renderToStaticMarkup(
    <ServiceAddressField value="" note="" onChange={noop} locale="en" error="address_required" />,
  );
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Enter the address where the service will happen\./);
  const errId = /<small id="([^"]+)" role="alert"/.exec(html)?.[1];
  assert.ok(errId, "error element has an id");
  assert.ok(html.includes(errId), "the id is referenced");
  assert.match(html, new RegExp(`aria-describedby="[^"]*${errId.replace(/[:]/g, "\\$&")}`));
});

test("note error attaches to the note input, not the address", () => {
  const html = renderToStaticMarkup(
    <ServiceAddressField value="Calle 5 #12" note="x" onChange={noop} locale="es" error="note_too_long" />,
  );
  assert.match(html, /La nota es muy larga/);
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 1);
  assert.match(html, /data-testid="cb-service-address-note-error"/);
  assert.ok(!html.includes('data-testid="cb-service-address-error"'));
});
