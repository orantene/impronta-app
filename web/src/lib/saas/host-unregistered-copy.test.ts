import test from "node:test";
import assert from "node:assert/strict";

import { hostUnregisteredCopy } from "./host-unregistered-copy";

test("Spanish unregistered-host copy has no em dash", () => {
  const c = hostUnregisteredCopy("es");
  assert.match(c.heading, /no está conectado/i);
  assert.doesNotMatch(`${c.title}${c.heading}${c.bodyBefore}`, /\u2014|\u2013/);
});

test("English unregistered-host copy stays English", () => {
  const c = hostUnregisteredCopy("en");
  assert.match(c.heading, /isn't connected|is not connected/i);
});
