import assert from "node:assert/strict";
import test from "node:test";

import { buildMenuServiceHrefs, menuItemServiceHref } from "./menu-links";
import { businessServicePathWithoutLocale, businessServiceSlug } from "./paths";

const ID_A = "0a1b2c3d-1111-4222-8333-444455556666";
const ID_B = "ffee1122-1111-4222-8333-444455556666";
const rows = [{ id: ID_A, title: "Corte de pelo" }];

test("item with a page row gets the Spanish path", () => {
  const map = buildMenuServiceHrefs(rows, { locale: "es", prefix: "" });
  assert.equal(menuItemServiceHref(map, ID_A), "/servicios/corte-de-pelo-0a1b2c3d");
});

test("item with a page row gets the English path", () => {
  const map = buildMenuServiceHrefs(rows, { locale: "en", prefix: "" });
  assert.equal(menuItemServiceHref(map, ID_A), "/services/corte-de-pelo-0a1b2c3d");
});

test("non-default locale prefix is applied (EN on an ES-default tenant)", () => {
  const map = buildMenuServiceHrefs(rows, { locale: "en", prefix: "/en" });
  assert.equal(menuItemServiceHref(map, ID_A), "/en/services/corte-de-pelo-0a1b2c3d");
  const trailing = buildMenuServiceHrefs(rows, { locale: "es", prefix: "/t/acme/" });
  assert.equal(menuItemServiceHref(trailing, ID_A), "/t/acme/servicios/corte-de-pelo-0a1b2c3d");
});

test("item without a page row gets no link", () => {
  const map = buildMenuServiceHrefs(rows, { locale: "es", prefix: "" });
  assert.equal(menuItemServiceHref(map, ID_B), null);
  assert.equal(menuItemServiceHref(undefined, ID_A), null);
  assert.equal(menuItemServiceHref(map, "constructor"), null);
});

test("href uses the shared slug builder", () => {
  const map = buildMenuServiceHrefs(rows, { locale: "es", prefix: "" });
  assert.equal(map[ID_A], businessServicePathWithoutLocale("es", businessServiceSlug({ id: ID_A, title: "Corte de pelo" })));
});

test("title-less row falls back to the bare id8 slug", () => {
  const map = buildMenuServiceHrefs([{ id: ID_B, title: null }], { locale: "en", prefix: "" });
  assert.equal(map[ID_B], "/services/ffee1122");
});
