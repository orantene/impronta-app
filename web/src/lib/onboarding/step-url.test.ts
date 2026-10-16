import test from "node:test";
import assert from "node:assert/strict";
import { urlWithStep } from "./step-url";

test("TUL-812: step goes into the query and keeps the other params", () => {
  assert.equal(urlWithStep("https://x.test/start?lang=es", "essentials"), "https://x.test/start?lang=es&step=essentials");
  assert.equal(urlWithStep("https://x.test/start?step=entry&lang=es", "ready"), "https://x.test/start?step=ready&lang=es");
});

test("no step, or a malformed one, removes the param", () => {
  assert.equal(urlWithStep("https://x.test/start?step=ready", null), "https://x.test/start");
  assert.equal(urlWithStep("https://x.test/start", "<script>"), "https://x.test/start");
});
