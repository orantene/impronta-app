import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildHubClientEntry } from "./hub-client-entry";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-730: hub client entry links go to app-host client sign-in and sign-up, back through /account/return", () => {
  const e = buildHubClientEntry("https://app.tulala.digital/", "https://tulala.digital/t/TAL-93940");
  assert.equal(
    e.signInHref,
    "https://app.tulala.digital/login?as=client&next=" +
      encodeURIComponent("/account/return?to=" + encodeURIComponent("https://tulala.digital/t/TAL-93940")),
  );
  assert.match(e.createHref, /^https:\/\/app\.tulala\.digital\/register\?as=client&next=/);
});

test("TUL-856: the Spanish profile keeps Spanish on both app pages and in the return URL", () => {
  const e = buildHubClientEntry("https://app.tulala.digital", "https://tulala.digital/t/TAL-93940", "es");
  assert.match(e.signInHref, /^https:\/\/app\.tulala\.digital\/es\/login\?as=client&next=/);
  assert.match(e.createHref, /^https:\/\/app\.tulala\.digital\/es\/register\?as=client&next=/);
  const next = new URL(e.signInHref).searchParams.get("next")!;
  assert.equal(new URL(next, "https://app.tulala.digital").searchParams.get("to"), "https://tulala.digital/es/t/TAL-93940");
  // Already Spanish: not doubled.
  const again = buildHubClientEntry("https://app.tulala.digital", "https://tulala.digital/es/t/TAL-93940", "es");
  assert.equal(new URL(new URL(again.signInHref).searchParams.get("next")!, "https://x.y").searchParams.get("to"), "https://tulala.digital/es/t/TAL-93940");
  assert.match(read("src/app/t/[profileCode]/profile-view.tsx"), /buildHubClientEntry\(getAppUrl\(\), canonicalShareUrl, locale\)/);
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
