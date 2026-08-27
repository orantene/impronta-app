import assert from "node:assert/strict";
import { test } from "node:test";

import { getAtPath, setAtPath, rootKeyOf, describeNestedPath } from "./nested-prop-path";

const PROPS = {
  fields: [
    { name: "name", label: "Name", placeholder: "Your name" },
    { name: "brief", label: "What are you booking?" },
  ],
  config: { requestCta: { href: "/contact", label: "Request" } },
};

test("reads a string through arrays and objects", () => {
  assert.equal(getAtPath(PROPS, "fields.0.label"), "Name");
  assert.equal(getAtPath(PROPS, "fields.1.label"), "What are you booking?");
  assert.equal(getAtPath(PROPS, "config.requestCta.label"), "Request");
});

test("returns undefined for an absent path or a non-string leaf", () => {
  assert.equal(getAtPath(PROPS, "fields.9.label"), undefined);
  assert.equal(getAtPath(PROPS, "nope.deep"), undefined);
  assert.equal(getAtPath(PROPS, "fields"), undefined);
});

test("writes immutably and leaves the input untouched", () => {
  const next = setAtPath(PROPS, "fields.0.label", "Nombre");
  assert.equal(getAtPath(next, "fields.0.label"), "Nombre");
  assert.equal(PROPS.fields[0]!.label, "Name", "input must not be mutated");
  assert.equal(getAtPath(next, "fields.1.label"), "What are you booking?", "siblings intact");
  assert.equal(getAtPath(next, "config.requestCta.href"), "/contact", "href untouched");
});

test("writes a nested object path", () => {
  const next = setAtPath(PROPS, "config.requestCta.label", "Solicitar");
  assert.equal(getAtPath(next, "config.requestCta.label"), "Solicitar");
});

test("REFUSES to create structure the node does not already have", () => {
  const next = setAtPath(PROPS, "fields.7.label", "Ghost");
  assert.equal(next, PROPS, "unchanged reference when the path is absent");
  assert.equal(setAtPath(PROPS, "brand.new.key", "x"), PROPS);
});

test("names the props key a patch must carry", () => {
  assert.equal(rootKeyOf("fields.3.label"), "fields");
  assert.equal(rootKeyOf("config.requestCta.label"), "config");
});

test("describes a path for a human, 1-based", () => {
  assert.equal(describeNestedPath("fields.0.label"), "fields 1 · label");
  assert.equal(describeNestedPath("fields.3.placeholder"), "fields 4 · placeholder");
  assert.equal(describeNestedPath("config.requestCta.label"), "config · label");
});
