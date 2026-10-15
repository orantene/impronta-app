import assert from "node:assert/strict";
import test from "node:test";

import { hostUnregisteredCopy } from "./host-unregistered-copy";

test("TUL-877: Spanish browser gets Spanish copy, English and unknown get English", () => {
  assert.equal(hostUnregisteredCopy("es-MX,es;q=0.9,en;q=0.8").heading, "Este dominio aún no está conectado");
  assert.equal(hostUnregisteredCopy("en-US,en;q=0.9").heading, "This domain isn't connected yet");
  assert.equal(hostUnregisteredCopy(null).locale, "en");
  assert.equal(hostUnregisteredCopy(null, "MX").locale, "es");
});
