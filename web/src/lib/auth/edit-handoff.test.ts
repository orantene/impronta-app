import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditHandoffStartUrl,
  needsEditAuthHandoff,
  resolveStorefrontEditorOpenUrl,
} from "./edit-handoff";

const APP = "https://app.tulala.digital";
const CUSTOM_EDITOR =
  "https://improntamodels.com/es/contacto?edit=1&panel=sections";
const SHARED_EDITOR =
  "https://impronta.tulala.digital/?edit=1&panel=sections";

test("needs hand-off: custom domain from app host → yes", () => {
  assert.equal(needsEditAuthHandoff(CUSTOM_EDITOR, "app.tulala.digital"), true);
});

test("needs hand-off: shared *.tulala.digital → no", () => {
  assert.equal(needsEditAuthHandoff(SHARED_EDITOR, "app.tulala.digital"), false);
});

test("needs hand-off: already on the custom host → no", () => {
  assert.equal(needsEditAuthHandoff(CUSTOM_EDITOR, "improntamodels.com"), false);
});

test("needs hand-off: localhost editor → no", () => {
  assert.equal(
    needsEditAuthHandoff("http://localhost:3000/acme?edit=1", "localhost"),
    false,
  );
});

test("needs hand-off: invalid URL → no", () => {
  assert.equal(needsEditAuthHandoff("not-a-url", "app.tulala.digital"), false);
});

test("mint URL wraps full ?edit=1 editor in /auth/sso/start?return=", () => {
  const url = buildEditHandoffStartUrl(APP, CUSTOM_EDITOR);
  assert.equal(
    url,
    `${APP}/auth/sso/start?return=${encodeURIComponent(CUSTOM_EDITOR)}`,
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/auth/sso/start");
  assert.equal(parsed.searchParams.get("return"), CUSTOM_EDITOR);
  assert.match(parsed.searchParams.get("return") ?? "", /\?edit=1/);
});

test("resolveStorefrontEditorOpenUrl: custom → hand-off start", () => {
  const open = resolveStorefrontEditorOpenUrl({
    editorAbsoluteUrl: CUSTOM_EDITOR,
    currentHostname: "app.tulala.digital",
    appUrl: APP,
  });
  assert.equal(open.startsWith(`${APP}/auth/sso/start?return=`), true);
  assert.equal(new URL(open).searchParams.get("return"), CUSTOM_EDITOR);
});

test("resolveStorefrontEditorOpenUrl: shared host → bare editor", () => {
  const open = resolveStorefrontEditorOpenUrl({
    editorAbsoluteUrl: SHARED_EDITOR,
    currentHostname: "app.tulala.digital",
    appUrl: APP,
  });
  assert.equal(open, SHARED_EDITOR);
});
