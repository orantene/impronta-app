import assert from "node:assert/strict";
import { test } from "node:test";

import { localisePublishPreflightMessage } from "./publish-preflight-message-es";

test("TUL-81: Free publish policy suffix localises on Spanish chrome", () => {
  const en =
    "Missing published homepage snapshot for locales: es, en. (Free publish policy)";
  const es = localisePublishPreflightMessage(en, "es");
  assert.match(es, /Falta la captura publicada/);
  assert.match(es, /plan gratuito/i);
  assert.doesNotMatch(es, /Free publish policy/);
  assert.equal(localisePublishPreflightMessage(en, "en"), en);
});

test("TUL-81: required-slot empty message localises", () => {
  const en =
    'Required slot "Hero" is empty. Add at least one section before publishing.';
  const es = localisePublishPreflightMessage(en, "es");
  assert.match(es, /Hero/);
  assert.match(es, /al menos una sección/);
  assert.equal(localisePublishPreflightMessage(en, "en"), en);
});

test("TUL-81: unknown EN message passes through", () => {
  assert.equal(
    localisePublishPreflightMessage("Brand new preflight check.", "es"),
    "Brand new preflight check.",
  );
});
