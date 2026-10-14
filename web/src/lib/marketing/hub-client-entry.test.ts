import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildHubClientEntry } from "./hub-client-entry";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-730: hub client entry links go to app-host client sign-in and sign-up", () => {
  const e = buildHubClientEntry("https://app.tulala.digital/", "https://tulala.digital/es/t/TAL-93940");
  assert.equal(
    e.signInHref,
    "https://app.tulala.digital/login?as=client&next=https%3A%2F%2Ftulala.digital%2Fes%2Ft%2FTAL-93940",
  );
  assert.match(e.createHref, /^https:\/\/app\.tulala\.digital\/register\?as=client&next=/);
});

test("TUL-730: hub profile passes clientEntry to the header (no unhosted modal event)", () => {
  assert.match(read("src/app/t/[profileCode]/profile-view.tsx"), /clientEntry=\{/);
});

test("TUL-730: header renders Entrar and Crear cuenta as links when clientEntry is set", () => {
  const h = read("src/components/marketing/header.tsx");
  assert.match(h, /clientEntry\.signInHref/);
  assert.match(h, /clientEntry\.createHref/);
  assert.match(read("src/lib/marketing/copy.ts"), /createAccount: "Crear cuenta"/);
});
