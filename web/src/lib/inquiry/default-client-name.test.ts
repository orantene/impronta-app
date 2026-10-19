import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultClientName } from "./default-client-name";

test("a stored name always wins", () => {
  assert.equal(defaultClientName("  Ana Ruiz ", "x@y.com"), "Ana Ruiz");
});

test("no name: a neutral label from the email local part", () => {
  assert.equal(defaultClientName(null, "maria.lopez@example.com"), "Maria Lopez");
  assert.equal(defaultClientName(undefined, "qa-b1-client@example.com"), "Qa B Client");
  assert.equal(defaultClientName("", "tulalaqa+paidclient@mail.com"), "Tulalaqa");
});

test("nothing usable stays empty (the field still asks)", () => {
  assert.equal(defaultClientName(null, null), undefined);
  assert.equal(defaultClientName(null, "not-an-email"), undefined);
  assert.equal(defaultClientName(null, "12345@x.com"), undefined);
});

test("both inquiry payload loaders use it for the signed-in drawer", () => {
  for (const f of ["src/lib/load-directory-inquiry-payload.ts", "src/app/t/[profileCode]/talent-profile-inquire-data.ts"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /defaultClientName\(/, f);
  }
});
