import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pickStarterBio,
  pickStarterI18nLabel,
  starterPrimaryLocale,
} from "./starter-locale";

test("starterPrimaryLocale maps es / en / junk", () => {
  assert.equal(starterPrimaryLocale("es"), "es");
  assert.equal(starterPrimaryLocale("es-MX"), "es");
  assert.equal(starterPrimaryLocale("en"), "en");
  assert.equal(starterPrimaryLocale(null), "en");
  assert.equal(starterPrimaryLocale(""), "en");
  assert.equal(starterPrimaryLocale("fr"), "en");
});

test("pickStarterBio: es primary prefers Spanish map over English", () => {
  const map = {
    es: "Manicuras y nail art en Guadalajara",
    en: "Manicures and nail art in Guadalajara",
  };
  assert.equal(
    pickStarterBio(map, "es", "Manicuras y nail art en Guadalajara"),
    "Manicuras y nail art en Guadalajara",
  );
});

test("pickStarterBio: es primary uses short_bio before English map", () => {
  const map = { en: "Manicures and nail art in Guadalajara" };
  assert.equal(
    pickStarterBio(map, "es", "Manicuras y nail art en Guadalajara"),
    "Manicuras y nail art en Guadalajara",
  );
});

test("pickStarterBio: en primary still prefers English", () => {
  const map = {
    es: "Manicuras y nail art en Guadalajara",
    en: "Manicures and nail art in Guadalajara",
  };
  assert.equal(pickStarterBio(map, "en", null), "Manicures and nail art in Guadalajara");
});

test("pickStarterI18nLabel prefers primary then en then es", () => {
  assert.equal(
    pickStarterI18nLabel({ es: "Uñas", en: "Nails" }, "es"),
    "Uñas",
  );
  assert.equal(
    pickStarterI18nLabel({ en: "Nails" }, "es"),
    "Nails",
  );
  assert.equal(pickStarterI18nLabel(null, "es"), null);
});
