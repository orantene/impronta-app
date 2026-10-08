import assert from "node:assert/strict";
import { test } from "node:test";
import { supportHandoffBody } from "./support-handoff-copy";

test("handoff body follows the locale", () => {
  assert.match(supportHandoffBody("en"), /^Your ticket is with .+\.$/);
  assert.match(supportHandoffBody("es"), /^Tu ticket está con .+\.$/);
  assert.match(supportHandoffBody(undefined), /^Your ticket is with/);
});
