import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { clientAccountEnabledFor, type ClientAccountHostKind } from "./flag";

const ORIGINAL = process.env.CLIENT_ACCOUNT_HOSTS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ALL: ClientAccountHostKind[] = ["talent", "agency", "hub", "app", "marketing"];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
  else process.env.CLIENT_ACCOUNT_HOSTS = ORIGINAL;
  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
});

test("unset is OFF for every host kind, in every NODE_ENV", () => {
  delete process.env.CLIENT_ACCOUNT_HOSTS;
  for (const env of ["development", "test", "production"]) {
    (process.env as Record<string, string | undefined>).NODE_ENV = env;
    for (const kind of ALL) assert.equal(clientAccountEnabledFor(kind), false, `${env}/${kind}`);
  }
});

test("empty, whitespace and unknown values are OFF", () => {
  for (const raw of ["", "  ", ",", "all", "1", "true", "creator"]) {
    process.env.CLIENT_ACCOUNT_HOSTS = raw;
    for (const kind of ALL) assert.equal(clientAccountEnabledFor(kind), false, `"${raw}"/${kind}`);
  }
});

test("a comma list enables exactly the listed kinds", () => {
  process.env.CLIENT_ACCOUNT_HOSTS = "talent, Agency ,bogus";
  assert.equal(clientAccountEnabledFor("talent"), true);
  assert.equal(clientAccountEnabledFor("agency"), true);
  assert.equal(clientAccountEnabledFor("hub"), false);
  assert.equal(clientAccountEnabledFor("app"), false);
  assert.equal(clientAccountEnabledFor("marketing"), false);
});

test("flag source never branches on NODE_ENV", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/client-account/flag.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /NODE_ENV/);
});
