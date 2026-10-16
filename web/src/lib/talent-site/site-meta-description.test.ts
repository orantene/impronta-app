import test from "node:test";
import assert from "node:assert/strict";

import { deriveSiteDescription } from "./site-meta-description";

test("TUL-798: ES and EN descriptions come from name, city and services", () => {
  assert.equal(
    deriveSiteDescription({ name: "Ana Ruiz", city: "Cancún", serviceNames: ["Corte", "Color"], locale: "es" }),
    "Ana Ruiz en Cancún: Corte, Color. Reserva en línea.",
  );
  assert.equal(
    deriveSiteDescription({ name: "Ana Ruiz", city: "Cancún", serviceNames: ["Haircut"], locale: "en" }),
    "Ana Ruiz in Cancún: Haircut. Book online.",
  );
});

test("TUL-798: no services falls back to a name-only line; no name yields nothing", () => {
  assert.equal(deriveSiteDescription({ name: "Ana", locale: "en" }), "Official site of Ana. Book online.");
  assert.equal(deriveSiteDescription({ name: " ", locale: "en" }), undefined);
});

test("TUL-798: clamped to 155 chars, never mentions the platform", () => {
  const d = deriveSiteDescription({
    name: "Ana Ruiz",
    city: "Cancún",
    serviceNames: ["Corte de cabello premium con lavado", "Coloración completa con tratamiento", "Peinado de novia y eventos", "Manicure"],
    locale: "es",
  })!;
  assert.ok(d.length <= 155);
  assert.doesNotMatch(d, /tulala/i);
});
